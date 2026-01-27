(() => {
  const links = Array.from(document.querySelectorAll('.admin-nav-link'));
  if (!links.length) {
    return;
  }

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const normalizedPath = path.startsWith('/admin/question') ? '/admin/exams' : path;

  links.forEach((link) => {
    const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '') || '/';
    const isExactMatch = normalizedPath === linkPath;
    const isChildMatch =
      linkPath !== '/admin' && normalizedPath.startsWith(`${linkPath}/`);

    if (isExactMatch || isChildMatch) {
      link.classList.add('is-active');
    }
  });
})();
