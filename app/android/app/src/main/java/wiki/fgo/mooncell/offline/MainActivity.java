package wiki.fgo.mooncell.offline;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyDarkStatusBar();

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
