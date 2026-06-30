const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

app.setName("交易复盘");

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    title: "交易复盘",
    backgroundColor: "#f6f7f9",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  window.loadURL(pathToFileURL(indexPath).toString());
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
