// Phone menu: the hamburger button opens the nav as a drop-down (styles.css, max-width 900px).
(function () {
  var btn = document.querySelector('.menu-btn');
  var menu = document.getElementById('site-menu');
  if (!btn || !menu) return;
  function set(open) {
    document.body.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    set(!document.body.classList.contains('menu-open'));
  });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  document.addEventListener('click', function (e) {
    if (document.body.classList.contains('menu-open') && !menu.contains(e.target)) set(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { set(false); btn.focus(); }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', function (m) { if (m.matches) set(false); });
})();
