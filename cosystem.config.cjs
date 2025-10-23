module.exports = {
  apps: [
    { name: "opened",   script: "src/listener/opened.js",   cwd: "./", watch: false, autorestart: true, time: true },
    { name: "executed", script: "src/listener/executed.js", cwd: "./", watch: false, autorestart: true, time: true },
    { name: "stops",    script: "src/listener/stopsUpdated.js", cwd: "./", watch: false, autorestart: true, time: true },
    { name: "removed",  script: "src/listener/removed.js",  cwd: "./", watch: false, autorestart: true, time: true }
  ]
};
