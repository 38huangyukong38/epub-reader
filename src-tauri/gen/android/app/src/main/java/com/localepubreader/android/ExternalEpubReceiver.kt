package com.localepubreader.android

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.util.ArrayDeque
import java.util.UUID
import java.util.concurrent.Executors

/** Only the main app document receives this private message port. */
class ExternalEpubReceiver(private val activity: MainActivity) {
  private data class Entry(val id: String, val name: String, val file: File?, val error: String?)
  private val files = linkedMapOf<String, Entry>()
  private val queue = ArrayDeque<String>()
  private val worker = Executors.newSingleThreadExecutor()
  private var webView: WebView? = null
  private var port: WebMessagePort? = null
  private var token = ""

  fun attach(view: WebView) {
    webView = view
    connectWhenReady()
  }

  fun connectWhenReady(attempt: Int = 0) {
    val view = webView ?: return
    if (activity.isDestroyed || attempt > 120) return
    view.post {
      val url = Uri.parse(view.url ?: "")
      val trusted = url.scheme in listOf("http", "https") && url.host in listOf("tauri.localhost", "localhost", "127.0.0.1")
      if (!trusted) { view.postDelayed({ connectWhenReady(attempt + 1) }, 100); return@post }
      view.evaluateJavascript("Boolean(window.__readerExternalFilesReady)") readyCheck@ { ready ->
        if (ready != "true") { view.postDelayed({ connectWhenReady(attempt + 1) }, 100); return@readyCheck }
        view.evaluateJavascript("Boolean(window.__readerExternalPortConnected && window.__readerExternalPortToken === ${JSONObject.quote(token)})") connectionCheck@ { connected ->
          if (connected == "true" && port != null) { notifyAvailable(); return@connectionCheck }
          connect(view, Uri.parse("${url.scheme}://${url.authority}"))
        }
      }
    }
  }

  private fun connect(view: WebView, origin: Uri) {
    port?.close()
    val ports = view.createWebMessageChannel()
    port = ports[0]
    token = UUID.randomUUID().toString()
    ports[0].setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
      override fun onMessage(replyPort: WebMessagePort, message: WebMessage) {
        val text = message.data ?: return
        worker.execute {
          var requestId = -1
          try {
            val request = JSONObject(text)
            requestId = request.getInt("requestId")
            val result = handle(request)
            send(replyPort, JSONObject().put("requestId", requestId).put("result", result))
          } catch (error: Exception) {
            send(replyPort, JSONObject().put("requestId", requestId).put("error", error.message ?: "无法打开 EPUB"))
          }
        }
      }
    })
    val currentToken = token
    view.evaluateJavascript("window.__readerExternalPortToken = ${JSONObject.quote(currentToken)}") {
      view.postWebMessage(WebMessage("reader-external-port:$currentToken", arrayOf(ports[1])), origin)
    }
  }

  private fun send(target: WebMessagePort, message: JSONObject) {
    activity.runOnUiThread {
      try { target.postMessage(WebMessage(message.toString())) } catch (_: IllegalStateException) { }
    }
  }

  private fun notifyAvailable() {
    val target = port ?: return
    send(target, JSONObject().put("kind", "available"))
  }

  @Synchronized private fun handle(request: JSONObject): Any {
    return when (request.getString("op")) {
      "take" -> {
        val result = JSONArray()
        while (queue.isNotEmpty()) {
          val entry = files[queue.removeFirst()] ?: continue
          result.put(JSONObject().put("id", entry.id).put("name", entry.name)
            .put("size", entry.file?.length() ?: 0).put("error", entry.error ?: JSONObject.NULL))
        }
        result
      }
      "read" -> {
        val entry = files[request.getString("id")] ?: error("文件打开请求已失效")
        val file = entry.file ?: error(entry.error ?: "无法读取文件")
        val offset = request.getLong("offset")
        require(offset >= 0 && offset <= file.length()) { "文件读取位置无效" }
        val buffer = ByteArray(minOf(128 * 1024L, file.length() - offset).toInt())
        RandomAccessFile(file, "r").use { input ->
          input.seek(offset)
          input.readFully(buffer)
        }
        JSONObject().put("data", Base64.encodeToString(buffer, Base64.NO_WRAP))
          .put("done", offset + buffer.size >= file.length())
      }
      "complete" -> {
        files.remove(request.getString("id"))?.file?.delete()
        JSONObject()
      }
      else -> error("不支持的文件操作")
    }
  }

  fun accept(intent: Intent?) {
    if (intent == null) return
    var uris = when (intent.action) {
      Intent.ACTION_VIEW -> listOfNotNull(intent.data)
      Intent.ACTION_SEND -> listOfNotNull(stream(intent))
      Intent.ACTION_SEND_MULTIPLE -> streams(intent)
      else -> emptyList()
    }
    if (uris.isEmpty() && intent.action in listOf(Intent.ACTION_VIEW, Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) {
      intent.clipData?.let { clip -> uris = (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri } }
    }
    for (uri in uris.distinct()) worker.execute { receive(uri) }
  }

  @Suppress("DEPRECATION") private fun stream(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION") private fun streams(intent: Intent): List<Uri> =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
    else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList()

  private fun receive(uri: Uri) {
    val id = UUID.randomUUID().toString()
    var name = "导入图书.epub"
    var temporary: File? = null
    val entry = try {
      require(uri.scheme in listOf("content", "file")) { "只能打开本地 EPUB 文件" }
      name = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: name
      if (uri.scheme == "content") {
        try {
          activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (column >= 0 && cursor.moveToFirst()) name = cursor.getString(column) ?: name
          }
        } catch (_: Exception) { /* Some providers allow reading but not metadata queries. */ }
      }
      val directory = File(activity.cacheDir, "external-epubs").apply { mkdirs() }
      val cachedFile = File(directory, "$id.epub")
      temporary = cachedFile
      val input = activity.contentResolver.openInputStream(uri) ?: error("无法读取该文件")
      input.use { source -> cachedFile.outputStream().use { target -> source.copyTo(target) } }
      Entry(id, name, cachedFile, null)
    } catch (error: Exception) {
      temporary?.delete()
      Entry(id, name, null, "无法打开 EPUB：${error.message ?: "文件无法访问"}")
    }
    synchronized(this) { files[id] = entry; queue.addLast(id) }
    notifyAvailable()
  }

  fun destroy() {
    port?.close()
    worker.shutdown()
  }
}
