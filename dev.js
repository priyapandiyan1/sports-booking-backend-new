const { spawn } = require('child_process');

console.log('Starting Backend Server...');
const backend = spawn('npx', ['nodemon', 'server.js'], { 
  stdio: 'inherit', 
  shell: true 
});

setTimeout(() => {
  console.log('Starting Frontend Server...');
  const frontend = spawn('npm', ['run', 'dev'], { 
    cwd: '../frontend', 
    stdio: 'inherit', 
    shell: true 
  });
}, 2000);
