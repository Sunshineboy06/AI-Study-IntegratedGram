# -*- coding: utf-8 -*-
"""AI学习一体化平台 · 公网部署版服务器

无服务端 AI：访客用「提示词」文件夹中的固定提示词在第三方 AI 生成文件后上传导入。
本服务器只负责：静态页面托管 + 文本解析（PDF/DOCX→文本）+ SSE 保活。

环境变量：
  PLATFORM_HOST  监听地址（默认 127.0.0.1，配 nginx 反代用；直连可设 0.0.0.0）
  PLATFORM_PORT  监听端口（默认 8796）
"""
import os

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.serving import WSGIRequestHandler

import parsers

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get("PLATFORM_HOST", "127.0.0.1")
PORT = int(os.environ.get("PLATFORM_PORT", "8796"))
MAX_UPLOAD = 100 * 1024 * 1024

ALLOWED_EXT = {".txt", ".md", ".markdown", ".docx", ".pdf", ".csv", ".json"}

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/config")
def api_config():
    """公网部署版标识：前端据此隐藏服务端 AI 入口。"""
    return jsonify(ok=True, public=True)


@app.post("/api/extract-text")
def api_extract_text():
    """上传词表文件（pdf/docx/txt/md/csv/json）并提取纯文本，供前端本地解析导入。"""
    f = request.files.get("file")
    if f is None or not f.filename:
        return jsonify({"ok": False, "error": "请先选择要上传的词表文件"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"ok": False,
                        "error": "不支持的文件类型 %s,请上传 .txt / .md / .docx / .pdf / .csv / .json" % ext}), 400
    import uuid
    import tempfile
    fd, tmp_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    f.save(tmp_path)
    try:
        text, _ = parsers.extract_text(tmp_path)
    except parsers.ParseError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
    if not text.strip():
        return jsonify({"ok": False, "error": "文件中没有提取到文本内容"}), 400
    return jsonify({"ok": True, "text": text, "ext": ext[1:]})


@app.get("/status")
def status():
    return app.response_class("ok", mimetype="text/plain")


@app.get("/sse")
def sse():
    """页面保活长连接（公网常驻服务，无自动退出逻辑）。"""
    def gen():
        import time
        while True:
            yield ": keepalive\n\n"
            time.sleep(15)
    resp = app.response_class(gen(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *args):
        pass


if __name__ == "__main__":
    from werkzeug.serving import make_server
    server = make_server(HOST, PORT, app, threaded=True,
                         request_handler=QuietHandler)
    print("AI学习一体化平台(公网版) listening on %s:%d" % (HOST, PORT))
    server.serve_forever()
