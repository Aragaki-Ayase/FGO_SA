package wiki.fgo.mooncell.offline;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int HEADER_BG_COLOR = Color.parseColor("#0f172a");

    /**
     * 强制将顶部状态栏统一为与 App 顶栏一致的深蓝色 (#0f172a) + 白色图标：
     * - 清除 SplashScreen / 系统可能残留的 FLAG_TRANSLUCENT_STATUS 半透明灰罩
     * - 关闭 Android 10+ 强制对比度灰罩 (setStatusBarContrastEnforced(false))
     * - 将 DecorView 与根内容容器底色同步设为 #0f172a，兼容 Android 15+ / HyperOS 等系统
     */
    private void applyDarkStatusBar() {
        Window window = getWindow();
        if (window == null) return;

        WindowCompat.setDecorFitsSystemWindows(window, true);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(HEADER_BG_COLOR);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
        }

        View decorView = window.getDecorView();
        decorView.setBackgroundColor(HEADER_BG_COLOR);
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            contentView.setBackgroundColor(HEADER_BG_COLOR);
        }

        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(window, decorView);
        controller.setAppearanceLightStatusBars(false);
    }

    /**
     * 供前端调用的原生图片保存桥接：绕开 WebView 不支持 blob 下载与 CORS 的限制，
     * 直接下载原图并写入手机系统相册 Pictures/Mooncell图鉴/ 目录。
     */
    private class NativeMediaBridge {
        @JavascriptInterface
        public void saveImage(String imageUrl, String rawFileName, String callbackId) {
            new Thread(() -> {
                try {
                    if (imageUrl == null || imageUrl.trim().isEmpty()) {
                        notifyImageSaveResult(callbackId, false, "无效的图片地址");
                        return;
                    }

                    byte[] bytes = downloadBytes(imageUrl.trim());
                    if (bytes == null || bytes.length == 0) {
                        notifyImageSaveResult(callbackId, false, "图片下载失败，请检查网络");
                        return;
                    }

                    String safeName = sanitizeFileName(rawFileName, imageUrl);
                    String mimeType = guessMimeType(safeName);

                    String savedDesc;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentResolver resolver = getContentResolver();
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName);
                        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
                        values.put(
                            MediaStore.Images.Media.RELATIVE_PATH,
                            Environment.DIRECTORY_PICTURES + "/Mooncell图鉴"
                        );
                        values.put(MediaStore.Images.Media.IS_PENDING, 1);

                        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                        if (uri == null) {
                            notifyImageSaveResult(callbackId, false, "无法创建系统相册文件");
                            return;
                        }
                        try (OutputStream out = resolver.openOutputStream(uri)) {
                            if (out == null) {
                                notifyImageSaveResult(callbackId, false, "无法写入系统相册");
                                return;
                            }
                            out.write(bytes);
                            out.flush();
                        }
                        values.clear();
                        values.put(MediaStore.Images.Media.IS_PENDING, 0);
                        resolver.update(uri, values, null, null);
                        savedDesc = "已保存到相册：Pictures/Mooncell图鉴/" + safeName;
                    } else {
                        File dir = new File(
                            getExternalFilesDir(Environment.DIRECTORY_PICTURES),
                            "Mooncell"
                        );
                        if (!dir.exists()) {
                            dir.mkdirs();
                        }
                        File outFile = new File(dir, safeName);
                        try (FileOutputStream fos = new FileOutputStream(outFile)) {
                            fos.write(bytes);
                            fos.flush();
                        }
                        MediaScannerConnection.scanFile(
                            MainActivity.this,
                            new String[] { outFile.getAbsolutePath() },
                            new String[] { mimeType },
                            null
                        );
                        savedDesc = "已保存：" + outFile.getName();
                    }

                    notifyImageSaveResult(callbackId, true, savedDesc);
                } catch (Exception e) {
                    String errMsg = e.getMessage() != null ? e.getMessage() : "保存图片失败";
                    notifyImageSaveResult(callbackId, false, "下载失败：" + errMsg);
                }
            }).start();
        }
    }

    private byte[] downloadBytes(String urlStr) throws Exception {
        String currentUrl = urlStr;
        for (int redirect = 0; redirect < 5; redirect++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 MooncellOfflineApp/1.0");
            conn.setRequestProperty("Referer", "https://fgo.wiki/");
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_TEMP
                || code == HttpURLConnection.HTTP_MOVED_PERM
                || code == HttpURLConnection.HTTP_SEE_OTHER
                || code == 307
                || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) break;
                currentUrl = loc;
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect();
                throw new Exception("HTTP " + code);
            }
            try (InputStream in = conn.getInputStream();
                 ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) != -1) {
                    bos.write(buf, 0, n);
                }
                return bos.toByteArray();
            } finally {
                conn.disconnect();
            }
        }
        return null;
    }

    private String sanitizeFileName(String rawName, String fallbackUrl) {
        String name = (rawName == null ? "" : rawName).trim();
        if (name.isEmpty()) {
            int slash = fallbackUrl.lastIndexOf('/');
            name = slash >= 0 ? fallbackUrl.substring(slash + 1) : "fgo_art.png";
        }
        int q = name.indexOf('?');
        if (q >= 0) name = name.substring(0, q);
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (name.isEmpty()) name = "fgo_art.png";
        String lower = name.toLowerCase();
        if (!lower.endsWith(".png") && !lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".webp")) {
            name = name + ".png";
        }
        return name;
    }

    private String guessMimeType(String fileName) {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        return "image/png";
    }

    private void notifyImageSaveResult(String callbackId, boolean ok, String message) {
        runOnUiThread(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                String js =
                    "window.__onNativeImageSaveResult && window.__onNativeImageSaveResult(" +
                    JSONObject.quote(callbackId == null ? "" : callbackId) + "," +
                    (ok ? "true" : "false") + "," +
                    JSONObject.quote(message == null ? "" : message) +
                    ");";
                webView.evaluateJavascript(js, null);
            }
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyDarkStatusBar();

        WebView initialWebView = getBridge() != null ? getBridge().getWebView() : null;
        if (initialWebView != null) {
            initialWebView.addJavascriptInterface(new NativeMediaBridge(), "MooncellNative");
        }

        OnBackPressedCallback backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                    return;
                }

                // 直接调用前端返回栈，避免 Android WebView 中 history.pushState 导致 canGoBack() 返回 false 的问题
                webView.evaluateJavascript(
                    "(function(){ return window.__fgoHandleAndroidBack ? window.__fgoHandleAndroidBack() : 'exit'; })();",
                    result -> {
                        if (result != null && result.contains("handled")) {
                            return;
                        }
                        if (webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    }
                );
            }
        };

        getOnBackPressedDispatcher().addCallback(this, backCallback);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyDarkStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyDarkStatusBar();
        }
    }
}
