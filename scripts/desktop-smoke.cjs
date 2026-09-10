// Isolated Electron integration checks. Never reads or writes the user's clips/settings.
const { app, desktopCapturer, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const sync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const output = path.join(root, 'artifacts', 'verification');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const temporary = process.env.PULSECLIP_SMOKE_DIRECTORY;
  assert.ok(temporary && path.dirname(temporary) === os.tmpdir(), 'Run through scripts/run-desktop-smoke.mjs');
  for (const name of ['profile', 'videos', 'logs']) sync.mkdirSync(path.join(temporary, name));
  app.setPath('userData', path.join(temporary, 'profile'));
  app.setPath('videos', path.join(temporary, 'videos'));
  app.setPath('logs', path.join(temporary, 'logs'));
  app.getVersion = () => require('../package.json').version;
  // Do not register login items or global shortcuts during tests.
  app.setLoginItemSettings = () => {};
  const { globalShortcut } = require('electron');
  globalShortcut.register = () => true;
  globalShortcut.unregisterAll = () => {};
  desktopCapturer.getSources = async () => [{
    id: 'screen:0:0', name: '테스트 화면', display_id: '0',
    thumbnail: nativeImage.createEmpty(), appIcon: nativeImage.createEmpty(),
  }];
  const { createDefaultSettings } = require('../dist-electron/shared/settings.js');
  sync.writeFileSync(path.join(temporary, 'profile', 'settings.json'), JSON.stringify({
    ...createDefaultSettings(path.join(temporary, 'videos')), completedOnboarding: true,
    selectedSourceId: 'screen:0:0', selectedSourceName: '테스트 화면', showNotifications: false,
  }));
  process.argv.push('--hidden');
  const windowReady = new Promise(resolve => app.once('browser-window-created', (_, window) => {
    window.webContents.once('did-finish-load', () => resolve(window));
  }));
  require('../dist-electron/main/main.js');
  const window = await windowReady;
  window.showInactive();
  window.webContents.on('console-message', (event) => { if (event.level === 'error') console.error(event.message); });
  await window.webContents.insertCSS('* { animation: none !important; transition: none !important; }');
  const run = async code => {
    try { return await window.webContents.executeJavaScript(code, true); }
    catch (error) { throw new Error(`Renderer check failed: ${code}`, { cause: error }); }
  };
  const until = async (code, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await run(code)) return;
      const failure = await run('document.querySelector(".toast-error")?.innerText ?? ""');
      if (failure) {
        console.error('Synthetic media:', await run('window.__smokeMedia?.diagnostics() ?? null'));
        console.error(await run('document.body.innerText'));
        throw new Error(`Desktop action failed: ${failure}`);
      }
      await wait(100);
    }
    console.error('Synthetic media:', await run('window.__smokeMedia?.diagnostics() ?? null'));
    throw new Error(`Timed out: ${code}`);
  };
  const click = async text => {
    const clicked = await run(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.replace(e.querySelector('kbd')?.textContent || '', '').trim() === ${JSON.stringify(text)} || e.querySelector(':scope > span')?.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
    if (!clicked) console.error(await run('document.body.innerText'));
    assert.ok(clicked, `Button available: ${text}`);
    await wait(250);
  };
  await until('Boolean(document.querySelector(".app-shell"))');
  await fs.mkdir(output, { recursive: true });
  const capture = async name => {
    await run('document.querySelectorAll(".toast > button").forEach(button => button.click())');
    await run('document.getAnimations().forEach(animation => { if (animation.effect?.getTiming().iterations !== Infinity) animation.finish(); })');
    await wait(400);
    const image = await window.webContents.capturePage();
    await fs.writeFile(path.join(output, `${baseline ? 'before' : 'after'}-${name}.png`), image.toPNG());
  };
  await capture('home');
  await click('내 클립');
  await capture('library');
  await click('설정');
  await capture('settings');
  await click('상태 점검');
  await until('!document.querySelector(".diagnostics-page .spin")');
  await capture('diagnostics');
  if (!baseline) {
    // Exercise the real WebCodecs recorder with synthetic media, never the user's desktop or microphone.
    await run(`(() => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => { ctx.fillStyle = ['#243b53','#334e68','#486581'][Math.floor(frame/30)%3]; ctx.fillRect(0,0,640,360); ctx.fillStyle='#ffffff';ctx.font='28px sans-serif';ctx.fillText('PulseClip media test · ' + frame++,32,190); }, 33);
      navigator.mediaDevices.getDisplayMedia = async () => {
        const stream = canvas.captureStream(30);
        // Keep audio processing independent of physical output devices on CI runners.
        const audio = new AudioContext({ sampleRate: 48000, sinkId: { type: 'none' } });
        const oscillator = audio.createOscillator();
        const gain = audio.createGain(); gain.gain.value = 0.005;
        const destination = audio.createMediaStreamDestination(); oscillator.connect(gain).connect(destination); oscillator.start();
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        await audio.resume();
        window.__smokeMedia = { stream, audio, oscillator, gain, destination, canvas, timer,
          diagnostics: () => ({ frames: frame, audioState: audio.state, audioTime: audio.currentTime,
            tracks: stream.getTracks().map(track => ({ kind: track.kind, state: track.readyState, muted: track.muted })) }) };
        return stream;
      };
    })()`);
    await click('홈');
    await click('리플레이 준비 켜기');
    await until('document.querySelector(".live-badge")?.textContent.includes("리플레이 준비됨")', 20000);
    // A disconnected source must disable recording while recovery reconnects it.
    await run('window.__smokeMedia.stream.getVideoTracks()[0].dispatchEvent(new Event("ended"))');
    await until('document.querySelector(".live-badge")?.textContent.includes("장치 복구 중")');
    assert.ok(await run('document.querySelector(".recording-button").disabled && document.querySelector(".replay-button").disabled'));
    assert.ok(await run('Boolean(document.querySelector(".capture-notice[role=status]"))'));
    await fs.writeFile(path.join(output, 'after-recovery.png'), (await window.webContents.capturePage()).toPNG());
    await until('document.querySelector(".live-badge")?.textContent.includes("리플레이 준비됨")', 20000);
    await wait(1800);
    await click('전체 녹화 시작');
    await until('document.querySelector(".live-badge")?.textContent.includes("녹화 중")');
    await wait(3000);
    await click('최근 45초 저장');
    await until('!document.querySelector(".recording-button")?.disabled');
    await click('전체 녹화 종료');
    await until('document.querySelector(".live-badge")?.textContent.includes("리플레이 준비됨")');
    await click('리플레이 준비 끄기');
    await click('내 클립');
    await until('document.querySelectorAll(".clip-card").length === 2');
    const saved = await run('window.pulseClip.listClips()');
    assert.equal(saved.clips.length, 2);
    assert.ok(saved.clips.every(clip => clip.bytes > 1000 && clip.durationMs > 1000));
    await capture('library-populated');
    await run('document.querySelector(".clip-preview").click()');
    await until('document.querySelector(".player-stage video")?.readyState >= 2');
    await run('document.querySelector(".player-stage video").pause()');
    await capture('player');
    await run(`document.querySelector('[aria-label="클립 이름 변경"]').click()`);
    await wait(150);
    await run(`(() => {const input=document.querySelector('[aria-label="클립 이름"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'테스트 하이라이트'); input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await click('저장');
    await until('document.querySelector(".player-title-row h2")?.textContent === "테스트 하이라이트"');
    await click('구간 잘라 저장');
    await run(`(() => {const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; for(const [label,value] of [['편집 시작 시간 (초)','1'],['편집 종료 시간 (초)','2.5']]) {const el=document.querySelector('[aria-label="'+label+'"]');setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await wait(250);
    await capture('trim');
    await click('새 클립 저장');
    await until('document.querySelector(".player-modal .type-edited") !== null', 30000);
    await until('document.querySelector(".player-stage video")?.readyState >= 2');
    const final = await run('window.pulseClip.listClips()');
    assert.equal(final.clips.length, 3, 'Original recordings are preserved');
    const edited = final.clips.find(clip => clip.kind === 'edited');
    assert.equal(edited.durationMs, 1500);
    const playback = await run('({ duration: document.querySelector(".player-stage video").duration, error: document.querySelector(".player-stage video").error })');
    assert.equal(playback.error, null);
    assert.ok(Math.abs(playback.duration - 1.5) < 0.25, `Trim duration: ${playback.duration}`);
    const editedMetadata = await run(`(async () => { const response = await fetch(${JSON.stringify(edited.mediaUrl)}, { headers: { Range: 'bytes=0-31' } }); return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }; })()`);
    assert.equal(editedMetadata.status, 206, 'Same-origin MP4 range requests work');
    assert.equal(editedMetadata.bytes, 32);
    await capture('edited-player');
    // Cancel during an intentionally delayed read and prove no extra clip is committed.
    await run(`(() => { const originalFetch = window.fetch; window.__restoreFetch = () => { window.fetch = originalFetch; }; window.fetch = async (...args) => { await new Promise(resolve => setTimeout(resolve, 500)); return originalFetch(...args); }; })()`);
    await click('구간 잘라 저장');
    await click('새 클립 저장');
    await click('편집 취소');
    await until('[...document.querySelectorAll("button")].some(button => button.textContent.includes("새 클립 저장") && !button.disabled)');
    await run('window.__restoreFetch()');
    assert.equal((await run('window.pulseClip.listClips()')).clips.length, 3, 'Canceled edit creates no clip');
    await run(`document.querySelector('[aria-label="클립 플레이어 닫기"]').click()`);
    window.setSize(1080, 700);
    await click('설정');
    await capture('settings-1080');
    assert.equal(await run('document.querySelector(".main-content").scrollWidth > document.querySelector(".main-content").clientWidth'), false, 'No horizontal overflow at minimum window size');
    await click('30 FPS');
    await click('내 클립');
    await until('Boolean(document.querySelector("[role=alertdialog]"))');
    await click('취소');
    assert.ok(await run('Boolean(document.querySelector(".settings-page"))'));
    await click('변경사항 저장');
    await until('document.querySelector(".save-settings")?.disabled === true');
    assert.equal((await run('window.pulseClip.bootstrap()')).settings.fps, 30);
    await run(`(() => {const input=document.querySelector('[aria-label="녹화 시작/종료 단축키"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'F8'); input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until('document.querySelector(".inline-error")?.textContent.includes("서로 다른 단축키")');
    assert.ok(await run('document.querySelector(".save-settings").disabled'));
    await click('변경사항 되돌리기');
    console.log('Desktop media: source recovery, recording + simultaneous replay, rename, trim, cancel, original preservation, MP4 range/playback, minimum window layout, settings persistence and shortcut validation passed.');
  }
  console.log('Desktop smoke: bootstrap, navigation, settings, diagnostics passed.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Desktop smoke timed out'); app.exit(1); }, 90000).unref();
