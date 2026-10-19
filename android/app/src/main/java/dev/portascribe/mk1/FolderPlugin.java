package dev.portascribe.mk1;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * A folder the writer chose (Storage Access Framework), kept with a lasting permission.
 * The app mirrors everything into it as plain files, so the work outlives the app: delete it, install it again (or any
 * later app), pick the same folder, and it all comes back. Paths are relative to the folder, '/'-separated.
 */
@CapacitorPlugin(name = "FoolscapFolder")
public class FolderPlugin extends Plugin {
    private static final String PREFS = "foolscap-folder";
    private static final int RW = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    /** path → document id, so a write does not walk the folder every time */
    private final Map<String, String> ids = new HashMap<>();

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private ContentResolver cr() { return getContext().getContentResolver(); }
    private Uri tree() {
        String s = prefs().getString("tree", null);
        return s == null ? null : Uri.parse(s);
    }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= 26) {
            Uri start = tree();
            if (start == null) start = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Documents");
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, start);
        }
        startActivityForResult(call, i, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("No folder chosen", "CANCELLED");
            return;
        }
        Uri uri = data.getData();
        try {
            cr().takePersistableUriPermission(uri, RW);
        } catch (SecurityException e) {
            call.reject("That folder can't be kept", "NO_ACCESS");
            return;
        }
        String old = prefs().getString("tree", null);
        if (old != null && !old.equals(uri.toString())) {
            try { cr().releasePersistableUriPermission(Uri.parse(old), RW); } catch (Exception ignored) { }
        }
        prefs().edit().putString("tree", uri.toString()).apply();
        ids.clear();
        JSObject ret = new JSObject();
        ret.put("name", displayName(uri));
        call.resolve(ret);
    }

    @PluginMethod
    public void info(PluginCall call) {
        Uri t = tree();
        JSObject ret = new JSObject();
        ret.put("ok", t != null && granted(t));
        if (t != null) ret.put("name", displayName(t));
        call.resolve(ret);
    }

    @PluginMethod
    public void forget(PluginCall call) {
        Uri t = tree();
        if (t != null) {
            try { cr().releasePersistableUriPermission(t, RW); } catch (Exception ignored) { }
        }
        prefs().edit().remove("tree").apply();
        ids.clear();
        call.resolve();
    }

    @PluginMethod
    public void write(PluginCall call) {
        Uri t = usable(call);
        if (t == null) return;
        String path = call.getString("path", "");
        String data = call.getString("data", "");
        byte[] bytes = Boolean.TRUE.equals(call.getBoolean("base64", false)) ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
        try {
            writeBytes(t, path, bytes);
        } catch (Exception first) {
            // the folder may have been changed by someone else: forget what we knew and try once more
            ids.clear();
            try {
                writeBytes(t, path, bytes);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()), "WRITE_FAILED");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri t = usable(call);
        if (t == null) return;
        String path = call.getString("path", "");
        JSObject ret = new JSObject();
        try {
            String id = resolve(t, path, false, false);
            if (id == null) {
                ret.put("data", JSONObject.NULL);
                call.resolve(ret);
                return;
            }
            byte[] bytes;
            try (InputStream in = cr().openInputStream(DocumentsContract.buildDocumentUriUsingTree(t, id))) {
                if (in == null) throw new IOException("no stream");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                bytes = out.toByteArray();
            }
            boolean b64 = Boolean.TRUE.equals(call.getBoolean("base64", false));
            ret.put("data", b64 ? Base64.encodeToString(bytes, Base64.NO_WRAP) : new String(bytes, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            ids.remove(path);
            call.reject(String.valueOf(e.getMessage()), "READ_FAILED");
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        Uri t = usable(call);
        if (t == null) return;
        String path = call.getString("path", "");
        JSArray names = new JSArray();
        try {
            String id = resolve(t, path, false, true);
            if (id != null) {
                Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(t, id);
                try (Cursor c = cr().query(kids, new String[]{Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                    while (c != null && c.moveToNext()) names.put(c.getString(0));
                }
            }
            JSObject ret = new JSObject();
            ret.put("names", names);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), "LIST_FAILED");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        Uri t = usable(call);
        if (t == null) return;
        String path = call.getString("path", "");
        try {
            String id = resolve(t, path, false, false);
            if (id != null) DocumentsContract.deleteDocument(cr(), DocumentsContract.buildDocumentUriUsingTree(t, id));
            ids.remove(path);
            call.resolve();
        } catch (Exception e) {
            ids.remove(path);
            call.reject(String.valueOf(e.getMessage()), "REMOVE_FAILED");
        }
    }

    // ---------------------------------------------------------------------------------------------------------

    /** The chosen folder, if we still may use it; otherwise the call is rejected and null comes back. */
    private Uri usable(PluginCall call) {
        Uri t = tree();
        if (t == null) { call.reject("No folder chosen", "NO_FOLDER"); return null; }
        if (!granted(t)) { call.reject("The folder is no longer reachable", "NO_ACCESS"); return null; }
        return t;
    }

    private boolean granted(Uri t) {
        for (UriPermission p : cr().getPersistedUriPermissions()) {
            if (p.getUri().equals(t) && p.isReadPermission() && p.isWritePermission()) return true;
        }
        return false;
    }

    private String displayName(Uri t) {
        try (Cursor c = cr().query(DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t)),
                new String[]{Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        return "";
    }

    private void writeBytes(Uri t, String path, byte[] bytes) throws Exception {
        String id = resolve(t, path, true, false);
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, id);
        try (OutputStream out = cr().openOutputStream(doc, "wt")) {
            if (out == null) throw new IOException("no stream");
            out.write(bytes);
        }
    }

    /** Document id for a path inside the folder ("" is the folder itself), creating folders and the file if asked. */
    private String resolve(Uri t, String path, boolean create, boolean dir) throws Exception {
        String parent = DocumentsContract.getTreeDocumentId(t);
        String[] parts = path.split("/");
        StringBuilder sofar = new StringBuilder();
        for (int k = 0; k < parts.length; k++) {
            String name = parts[k];
            if (name.isEmpty()) continue;
            if (sofar.length() > 0) sofar.append('/');
            sofar.append(name);
            String key = sofar.toString();
            String known = ids.get(key);
            if (known != null) { parent = known; continue; }
            String id = child(t, parent, name);
            if (id == null) {
                if (!create) return null;
                boolean leaf = k == parts.length - 1 && !dir;
                // octet-stream keeps the name exactly as given (no "(1)", no extra extension)
                Uri made = DocumentsContract.createDocument(cr(), DocumentsContract.buildDocumentUriUsingTree(t, parent),
                        leaf ? "application/octet-stream" : Document.MIME_TYPE_DIR, name);
                if (made == null) throw new IOException("could not create " + key);
                id = DocumentsContract.getDocumentId(made);
            }
            ids.put(key, id);
            parent = id;
        }
        return parent;
    }

    private String child(Uri t, String parentId, String name) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(t, parentId);
        try (Cursor c = cr().query(kids, new String[]{Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            while (c != null && c.moveToNext()) if (name.equals(c.getString(1))) return c.getString(0);
        }
        return null;
    }
}
