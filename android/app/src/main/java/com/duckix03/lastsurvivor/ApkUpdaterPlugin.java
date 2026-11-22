package com.duckix03.lastsurvivor;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Atualização do app sem sair do jogo: baixa o APK novo (Releases do GitHub) pra pasta de cache e abre o instalador do
// Android por cima. O jogo (js/config.js → LS.AppUpdate) mostra a barra de progresso com o evento "progress".
// Como todo APK é assinado com a mesma chave, ele instala POR CIMA, sem perder nada.
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private volatile boolean busy = false;

    private File apkFile() { return new File(new File(getContext().getCacheDir(), "update"), "LastSurvivor.apk"); }

    // Android 8+: o usuário precisa permitir "instalar apps desconhecidos" pro Last Survivor (uma vez só)
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(r);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = Build.VERSION.SDK_INT >= 26
                ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não deu pra abrir as configurações: " + e.getMessage());
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Endereço inválido."); return; }
        if (busy) { call.reject("Já está baixando."); return; }
        busy = true;
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                File out = apkFile(), dir = out.getParentFile(), tmp = new File(dir, "LastSurvivor.part");
                if (dir != null && !dir.exists() && !dir.mkdirs()) throw new IOException("sem espaço pra salvar");
                // o link do GitHub redireciona pro servidor de arquivos: segue os redirecionamentos (só https)
                String u = url;
                for (int hop = 0; ; hop++) {
                    if (hop > 6) throw new IOException("redirecionamentos demais");
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "LastSurvivor-App");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location");
                        c.disconnect(); c = null;
                        if (loc == null) throw new IOException("redirecionamento sem destino");
                        u = new URL(new URL(u), loc).toString();
                        if (!u.startsWith("https://")) throw new IOException("endereço inseguro");
                        continue;
                    }
                    if (code != 200) throw new IOException("o servidor respondeu " + code);
                    break;
                }
                long total = c.getContentLength(), got = 0;
                int lastPct = -2;
                try (InputStream in = new BufferedInputStream(c.getInputStream()); OutputStream os = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        got += n;
                        int pct = total > 0 ? (int) (got * 100 / total) : -1;
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject ev = new JSObject();
                            ev.put("loaded", got); ev.put("total", total); ev.put("pct", pct);
                            notifyListeners("progress", ev);
                        }
                    }
                }
                if (got < 1000000) throw new IOException("arquivo incompleto (" + got + " bytes)");
                if (out.exists() && !out.delete()) throw new IOException("não deu pra trocar o arquivo antigo");
                if (!tmp.renameTo(out)) throw new IOException("não deu pra salvar o arquivo");
                JSObject r = new JSObject();
                r.put("bytes", got);
                call.resolve(r);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
            } finally {
                busy = false;
                if (c != null) c.disconnect();
            }
        }).start();
    }

    // abre o instalador do Android com o APK baixado
    @PluginMethod
    public void install(PluginCall call) {
        try {
            File f = apkFile();
            if (!f.exists()) { call.reject("Baixe a atualização primeiro."); return; }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não deu pra abrir o instalador: " + e.getMessage());
        }
    }
}
