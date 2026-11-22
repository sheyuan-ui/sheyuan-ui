/**
 * 自带验证页：GET / 返回。只用于人工验收新接口行为，不属于 T02 契约。
 * 页面 JS 不使用模板字符串，避免与本文件的模板字面量冲突。
 */
export const DEMO_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>helmet-hub 验证台</title>
<style>
  body { font-family: system-ui, "Microsoft YaHei", sans-serif; margin: 0; background: #f5f6f8; color: #1c2430; }
  header { padding: 14px 20px; background: #14213d; color: #fff; font-size: 16px; }
  main { padding: 16px 20px; max-width: 1080px; margin: 0 auto; }
  section { background: #fff; border: 1px solid #e3e6ea; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; }
  h2 { font-size: 14px; margin: 0 0 10px; color: #33415c; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eef0f3; }
  th { color: #6b7686; font-weight: 600; }
  button { font-size: 12px; padding: 4px 10px; margin-right: 6px; border: 1px solid #c6ccd6; border-radius: 6px; background: #fff; cursor: pointer; }
  button:hover { background: #eef2f7; }
  button.primary { background: #14213d; color: #fff; border-color: #14213d; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; background: #eef0f3; }
  .tag.ok { background: #e2f4e8; color: #1d7a3d; }
  .tag.warn { background: #fdf0dc; color: #9a6a12; }
  .tag.bad { background: #fbe3e3; color: #a12626; }
  #barwrap { height: 10px; background: #e8ebef; border-radius: 6px; overflow: hidden; margin: 10px 0 6px; }
  #bar { height: 100%; width: 0%; background: #2f7d4f; transition: width .2s; }
  #log { font-family: ui-monospace, Consolas, monospace; font-size: 12px; background: #101418; color: #cfe3cf; padding: 10px; border-radius: 6px; max-height: 220px; overflow: auto; white-space: pre-wrap; }
  .muted { color: #6b7686; font-size: 12px; }
</style>
</head>
<body>
<header>helmet-hub 验证台 · 亲眼看到接口层的变化</header>
<main>
  <section>
    <h2>设备与指令（乐观锁）</h2>
    <table id="devices"></table>
    <p>
      <button class="primary" id="cmd-ok">用当前版本下发 pause_job</button>
      <button id="cmd-stale">用旧版本下发（应被 409 拒绝）</button>
      <span class="muted" id="cmd-result"></span>
    </p>
  </section>
  <section>
    <h2>任务</h2>
    <table id="jobs"></table>
  </section>
  <section>
    <h2>会话</h2>
    <table id="sessions"></table>
  </section>
  <section>
    <h2>事件与人工复核（只改 review，AI 判定不变）</h2>
    <table id="events"></table>
  </section>
  <section>
    <h2>分块上传 + WebSocket 实时进度</h2>
    <p><button class="primary" id="upload">开始上传演示（33 字节 / 5 块）</button>
       <span class="muted" id="upload-status"></span></p>
    <div id="barwrap"><div id="bar"></div></div>
    <p class="muted">进度条由 ws://…/ws 的 upload.progress 推送驱动，不是轮询。</p>
  </section>
  <section>
    <h2>调用日志（状态码 / 错误码 / request_id）</h2>
    <div id="log"></div>
  </section>
</main>
<script>
var CONTENT = 'helmet-hub-demo-upload-0123456789';
var SHA = '0c1051e1fe95ec4d7a6fa588d104ebb638da68a92030a9c4936a00bb02cbd3ee';
var CHUNK = 8;
var state = { version: 0, device: null, session: null, upload: null };
var socket = null;

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function log(line) {
  var el = document.getElementById('log');
  el.textContent = new Date().toLocaleTimeString() + '  ' + line + '\\n' + el.textContent;
}
function tag(text, kind) {
  return '<span class="tag ' + (kind || '') + '">' + esc(text) + '</span>';
}
async function api(path, method, body, key, extra) {
  var headers = Object.assign({ 'content-type': 'application/json' }, extra || {});
  if (key) headers['idempotency-key'] = key;
  var res = await fetch(path, {
    method: method || 'GET',
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  var json = await res.json();
  log((method || 'GET') + ' ' + path + ' -> ' + res.status +
      (json.code ? ' ' + json.code : '') + '  req=' + String(json.request_id).slice(0, 8));
  return { status: res.status, body: json };
}

async function load() {
  var d = await api('/api/devices');
  var rows = '<tr><th>device_id</th><th>配对</th><th>电量</th><th>任务态</th><th>state_version</th></tr>';
  (d.body.data || []).forEach(function (item) {
    var s = item.status || {};
    if (!state.device) { state.device = item.device_id; state.version = s.state_version || 0; }
    rows += '<tr><td>' + esc(item.device_id) + '</td><td>' + tag(item.pair_status) + '</td><td>' +
            esc(s.battery_pct) + '%</td><td>' + esc(s.task_state) + '</td><td>' + esc(s.state_version) + '</td></tr>';
  });
  document.getElementById('devices').innerHTML = rows;

  var j = await api('/api/jobs?page_size=5');
  var jr = '<tr><th>job_id</th><th>状态</th><th>负责人</th><th>栋舍</th></tr>';
  (j.body.data.items || []).forEach(function (item) {
    jr += '<tr><td>' + esc(item.job_id) + '</td><td>' + tag(item.status) + '</td><td>' +
          esc(item.owner_name) + '</td><td>' + esc(item.house_id) + '</td></tr>';
  });
  document.getElementById('jobs').innerHTML = jr;

  var s = await api('/api/sessions?page_size=5');
  var sr = '<tr><th>session_id</th><th>状态</th><th>评分</th><th>score_version</th></tr>';
  (s.body.data.items || []).forEach(function (item) {
    if (!state.session) state.session = item.session_id;
    sr += '<tr><td>' + esc(item.session_id) + '</td><td>' + tag(item.status) + '</td><td>' +
          esc(item.score.value == null ? '--' : item.score.value) + '</td><td>' + esc(item.score.score_version) + '</td></tr>';
  });
  document.getElementById('sessions').innerHTML = sr;
  await loadEvents();
}

async function loadEvents() {
  if (!state.session) return;
  var e = await api('/api/sessions/' + state.session + '/events');
  var er = '<tr><th>event_id</th><th>action</th><th>confidence</th><th>复核结论</th><th>操作</th></tr>';
  (e.body.data || []).forEach(function (item) {
    var kind = item.review.conclusion === 'confirmed' ? 'ok'
             : item.review.conclusion === 'rejected' ? 'bad' : 'warn';
    er += '<tr><td>' + esc(item.event_id) + '</td><td>' + esc(item.action) + '</td><td>' +
          esc(item.confidence) + '</td><td>' + tag(item.review.conclusion, kind) + '</td><td>' +
          '<button data-review="' + esc(item.event_id) + '" data-conclusion="confirmed">确认</button>' +
          '<button data-review="' + esc(item.event_id) + '" data-conclusion="rejected">驳回</button>' +
          '</td></tr>';
  });
  document.getElementById('events').innerHTML = er;
}

document.getElementById('events').addEventListener('click', async function (ev) {
  var btn = ev.target.closest('button[data-review]');
  if (!btn) return;
  await api('/api/events/' + btn.dataset.review + '/review', 'POST',
    { conclusion: btn.dataset.conclusion, remark: '验证台操作' },
    'demo-review-' + Date.now(), { 'x-actor-id': 'demo-user' });
  await loadEvents();
});

document.getElementById('cmd-ok').addEventListener('click', function () { sendCommand(false); });
document.getElementById('cmd-stale').addEventListener('click', function () { sendCommand(true); });
async function sendCommand(stale) {
  var version = state.version - (stale ? 1 : 0);
  var r = await api('/api/commands', 'POST', {
    device_id: state.device, expected_state_version: version, action: 'pause_job'
  }, 'demo-cmd-' + Date.now());
  var el = document.getElementById('cmd-result');
  if (r.status === 201) {
    el.innerHTML = tag('accepted', 'ok') + ' 指令已受理（version=' + version + '）';
  } else {
    el.innerHTML = tag(r.body.code, 'bad') + ' ' + esc(r.body.message);
  }
}

function connectWs() {
  socket = new WebSocket('ws://' + location.host + '/ws?topics=upload.progress');
  socket.onmessage = function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.topic !== 'upload.progress' || !state.upload) return;
    if (msg.data.file_id !== state.upload) return;
    var p = msg.data.progress;
    document.getElementById('bar').style.width = (100 * p.uploaded_chunks / p.total_chunks) + '%';
    document.getElementById('upload-status').textContent =
      'WS 推送：' + p.uploaded_chunks + '/' + p.total_chunks + ' 块 · ' + msg.data.status;
  };
}

document.getElementById('upload').addEventListener('click', async function () {
  var fileId = 'demo-' + Date.now();
  state.upload = fileId;
  document.getElementById('bar').style.width = '0%';
  var created = await api('/api/uploads', 'POST', {
    file_id: fileId, owner_id: state.device, kind: 'event_clip',
    size_bytes: CONTENT.length, sha256: SHA, chunk_size: CHUNK
  }, 'demo-upload-' + fileId);
  if (created.status !== 201) { document.getElementById('upload-status').textContent = created.body.code; return; }

  var total = created.body.data.progress.total_chunks;
  for (var i = 0; i < total; i++) {
    var part = CONTENT.slice(i * CHUNK, (i + 1) * CHUNK);
    var res = await fetch('/api/uploads/' + fileId + '/chunks?chunk_index=' + i, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'idempotency-key': 'demo-chunk-' + fileId + '-' + i },
      body: part
    });
    var json = await res.json();
    log('POST chunks[' + i + '] -> ' + res.status);
    document.getElementById('bar').style.width = (100 * json.data.progress.uploaded_chunks / total) + '%';
  }
  var done = await api('/api/uploads/' + fileId + '/complete', 'POST', undefined, 'demo-complete-' + fileId);
  document.getElementById('upload-status').innerHTML =
    done.status === 200 ? tag('verified · SHA-256 校验通过', 'ok') : tag(done.body.code, 'bad');
});

connectWs();
load();
</script>
</body>
</html>
`;