package com.duckix03.lastsurvivor;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

// Last Survivor: abre em tela cheia (sem barra de status e de navegação), deitado, e a tela não apaga no meio da partida.
// O jogo desenha até a borda, inclusive onde fica o furo da câmera; por isso esta tela avisa o jogo (window.__lsInsets)
// de quanto o furo ocupa de cada lado, e o CSS afasta os botões e menus dali. Confere de novo quando o celular vira.
public class MainActivity extends BridgeActivity {
    private final Handler loop = new Handler(Looper.getMainLooper());
    private String lastJs = "";
    private int ticks = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        immersive();
    }

    @Override
    public void onResume() {
        super.onResume();
        loop.removeCallbacks(watch);
        loop.post(watch);
    }

    @Override
    public void onPause() {
        super.onPause();
        loop.removeCallbacks(watch);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) { immersive(); lastJs = ""; } // volta pra tela cheia depois de um aviso, teclado ou troca de app
    }

    private void immersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    // a cada 0,5 s: se o furo mudou de lado (celular girou 180°) manda de novo; a cada ~3 s manda mesmo sem mudar
    // (cobre a página recarregando)
    private final Runnable watch = new Runnable() {
        @Override
        public void run() {
            pushInsets();
            loop.postDelayed(this, 500);
        }
    };

    private void pushInsets() {
        View decor = getWindow().getDecorView();
        WindowInsets raw = decor.getRootWindowInsets();
        if (raw == null || getBridge() == null) return;
        WebView web = getBridge().getWebView();
        if (web == null) return;
        Insets cut = WindowInsetsCompat.toWindowInsetsCompat(raw, decor).getInsets(WindowInsetsCompat.Type.displayCutout());
        float d = getResources().getDisplayMetrics().density;
        String js = String.format(Locale.US,
            "window.__lsInsets={l:%.1f,r:%.1f,t:%.1f,b:%.1f};window.LS&&LS.App&&LS.App.applyInsets&&LS.App.applyInsets();",
            cut.left / d, cut.right / d, cut.top / d, cut.bottom / d);
        ticks++;
        if (js.equals(lastJs) && ticks % 6 != 0) return;
        lastJs = js;
        web.evaluateJavascript(js, null);
    }
}
