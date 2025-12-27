import { spawn } from "node:child_process";
import { exec } from "node:child_process";

// Запускаем Next.js dev сервер через bun
// Используем флаг --webpack для явного использования webpack вместо Turbopack
const nextDev = spawn("bun", ["--bun", "next", "dev", "--webpack"], {
  stdio: ["inherit", "inherit", "pipe"], // stderr отдельно для фильтрации
  shell: true,
  cwd: process.cwd(),
});

// Фильтруем ошибки WebSocket upgrade (не критичные предупреждения Next.js)
if (nextDev.stderr) {
  nextDev.stderr.on("data", (data: Buffer) => {
    const message = data.toString();
    // Пропускаем только ошибки WebSocket upgrade, остальные показываем
    if (!message.includes("upgrade requires a Request object") && 
        !message.includes("Error handling upgrade request")) {
      process.stderr.write(data);
    }
  });
}

// Ждём 5 секунд и открываем браузер
// Next.js может использовать другой порт, если 3000 занят
setTimeout(() => {
  // Пробуем определить порт из переменной окружения или используем 3000
  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}`;
  const platform = process.platform;
  
  let command: string;
  if (platform === "win32") {
    command = `start ${url}`;
  } else if (platform === "darwin") {
    command = `open ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.log(`Не удалось автоматически открыть браузер. Откройте вручную: ${url}`);
      console.log(`Или проверьте, на каком порту запущен сервер (обычно 3000 или 3001)`);
    } else {
      console.log(`✅ Браузер открыт: ${url}`);
    }
  });
}, 5000);

// Обработка завершения процесса
process.on("SIGINT", () => {
  nextDev.kill();
  process.exit();
});

process.on("SIGTERM", () => {
  nextDev.kill();
  process.exit();
});

