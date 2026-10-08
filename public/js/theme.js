(function() {
  const savedTheme = localStorage.getItem('app-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (savedTheme === 'light') {
    document.body?.classList.add('light-theme');
  }
})();

function toggleAppTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  if (document.body) {
    document.body.classList.toggle('light-theme', newTheme === 'light');
  }
  localStorage.setItem('app-theme', newTheme);
  updateThemeToggleIcons(newTheme);
}

function updateThemeToggleIcons(theme) {
  const icons = document.querySelectorAll('.theme-toggle-icon');
  const btns = document.querySelectorAll('.theme-toggle-btn');
  icons.forEach(icon => {
    if (theme === 'light') {
      icon.className = 'bi bi-sun-fill theme-toggle-icon';
      icon.style.color = '#f59e0b';
    } else {
      icon.className = 'bi bi-moon-stars-fill theme-toggle-icon';
      icon.style.color = '#fbbf24';
    }
  });
  btns.forEach(btn => {
    btn.setAttribute('title', theme === 'light' ? 'Ganti ke Mode Gelap (Dark)' : 'Ganti ke Mode Terang (Light)');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const theme = localStorage.getItem('app-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    document.body?.classList.add('light-theme');
  }
  updateThemeToggleIcons(theme);
});
