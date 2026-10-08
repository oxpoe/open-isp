module.exports = {
  apps: [{
    name: "billing-rtrw",
    script: "app-customer.js",
    cwd: "/opt/billing-rtrw",
    uid: 988,
    gid: 988,
    node_args: "--max-old-space-size=512",
    env: { NODE_ENV: "production" },
    autorestart: true,
    max_restarts: 30,
    restart_delay: 5000,
    time: true
  }]
};
