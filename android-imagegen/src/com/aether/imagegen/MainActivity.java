package com.aether.imagegen;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Hosts the bundled UI (assets/index.html) and gives it a native HTTP bridge.
 *
 * The Locally Uncensored remote server sends no CORS headers, so the page
 * cannot call it with fetch(); every API call goes through {@link Bridge#request}
 * instead and the result is handed back to JS via window.__nativeDone.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl("file:///android_asset/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__onBack && window.__onBack()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) MainActivity.super.onBackPressed();
            }
        });
    }

    private void deliver(final String id, final JSONObject result) {
        final String js = "window.__nativeDone(" + JSONObject.quote(id) + "," + result.toString() + ")";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    private static byte[] readAll(InputStream in) throws Exception {
        if (in == null) return new byte[0];
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return out.toByteArray();
    }

    private static HttpURLConnection open(String method, String url, String headersJson) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(600000);
        if (headersJson != null && !headersJson.isEmpty()) {
            JSONObject h = new JSONObject(headersJson);
            Iterator<String> keys = h.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                c.setRequestProperty(k, h.getString(k));
            }
        }
        return c;
    }

    private boolean saveToGallery(byte[] data, String name, String mime) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Images.Media.MIME_TYPE, mime);
            v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/LU Image Gen");
            Uri uri = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return false;
            try (OutputStream os = cr.openOutputStream(uri)) {
                os.write(data);
            }
            return true;
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (dir == null) return false;
        try (FileOutputStream os = new FileOutputStream(new File(dir, name))) {
            os.write(data);
        }
        return true;
    }

    public class Bridge {
        /** Async HTTP. Result: {status, body, headers:{lowercase-name: value}} or {error}. */
        @JavascriptInterface
        public void request(final String id, final String method, final String url,
                            final String headersJson, final String body) {
            new Thread(new Runnable() {
              @Override
              public void run() {
                JSONObject res = new JSONObject();
                try {
                    HttpURLConnection c = open(method, url, headersJson);
                    if (body != null && !body.isEmpty()) {
                        c.setDoOutput(true);
                        try (OutputStream os = c.getOutputStream()) {
                            os.write(body.getBytes("UTF-8"));
                        }
                    }
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    res.put("status", code);
                    res.put("body", new String(readAll(in), "UTF-8"));
                    JSONObject hdrs = new JSONObject();
                    for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
                        if (e.getKey() != null && !e.getValue().isEmpty()) {
                            hdrs.put(e.getKey().toLowerCase(), e.getValue().get(0));
                        }
                    }
                    res.put("headers", hdrs);
                    c.disconnect();
                } catch (Exception e) {
                    try { res.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {}
                }
                deliver(id, res);
              }
            }).start();
        }

        /** Downloads an image URL and writes it to Pictures/LU Image Gen. */
        @JavascriptInterface
        public void saveImage(final String id, final String url, final String headersJson, final String name) {
            new Thread(new Runnable() {
              @Override
              public void run() {
                JSONObject res = new JSONObject();
                try {
                    HttpURLConnection c = open("GET", url, headersJson);
                    int code = c.getResponseCode();
                    if (code >= 400) throw new Exception("HTTP " + code);
                    String mime = c.getContentType();
                    if (mime == null || !mime.startsWith("image/")) mime = "image/png";
                    byte[] data = readAll(c.getInputStream());
                    c.disconnect();
                    boolean ok = saveToGallery(data, name, mime);
                    res.put("ok", ok);
                    final String msg = ok ? "Saved to Pictures/LU Image Gen" : "Save failed";
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (Exception e) {
                    try { res.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {}
                }
                deliver(id, res);
              }
            }).start();
        }
    }
}
