package com.localepubreader.android

import android.os.Bundle
import android.content.Intent
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private val externalEpubs by lazy { ExternalEpubReceiver(this) }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    externalEpubs.accept(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    externalEpubs.accept(intent)
    externalEpubs.connectWhenReady()
  }

  override fun onResume() {
    super.onResume()
    externalEpubs.connectWhenReady()
  }

  override fun onDestroy() {
    externalEpubs.destroy()
    super.onDestroy()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    externalEpubs.attach(webView)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript(
          "window.dispatchEvent(new Event('reader-android-back', { cancelable: true }))"
        ) { unhandled ->
          if (unhandled != "false") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }
}
