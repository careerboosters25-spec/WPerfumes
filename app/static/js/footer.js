// Update Copyright Year in Footer
function updateCopyrightYear() {
    const copyrightElement = document.getElementById('copyright');
    if (copyrightElement) {
        const currentYear = new Date().getFullYear();
        copyrightElement.innerHTML = `&copy; ${currentYear} WPerfumes, Inc. All Rights Reserved.<br>Company Reg. No: 12345678A`;
    }
}
document.addEventListener('DOMContentLoaded', updateCopyrightYear);