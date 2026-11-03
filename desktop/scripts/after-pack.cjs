// electron-builder afterPack hook (v0.0.15, D-046). Electron's own Linux zip carries files
// that anyone can write to (0666/0777); in a .deb they would land in /opt like that, so any
// user of the computer could change the app. Every file gets 0755 (programs) or 0644, and
// every folder 0755, before the package is made. chrome-sandbox is set by the package's own
// install script (4755 or 0755).
const { chmodSync, lstatSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

function normalise(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      chmodSync(path, 0o755);
      normalise(path);
    } else {
      chmodSync(path, st.mode & 0o100 ? 0o755 : 0o644);
    }
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;
  normalise(context.appOutDir);
};
