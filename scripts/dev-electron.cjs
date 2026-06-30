const { spawn } = require("child_process");
const http = require("http");
const electronPath = require("electron");

const devServerUrl = "http://127.0.0.1:5173/";

const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
  stdio: "inherit",
});

function waitForServer(url, retries = 80) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (remaining <= 0) {
          reject(new Error("Vite dev server did not start in time."));
          return;
        }
        setTimeout(() => check(remaining - 1), 250);
      });
    };

    check(retries);
  });
}

waitForServer(devServerUrl)
  .then(() => {
    const electron = spawn(electronPath, ["."], {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devServerUrl,
      },
    });

    electron.on("exit", (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((error) => {
    console.error(error);
    vite.kill();
    process.exit(1);
  });

process.on("SIGINT", () => {
  vite.kill();
  process.exit(0);
});
