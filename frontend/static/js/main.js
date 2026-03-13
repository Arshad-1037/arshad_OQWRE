document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Modal Logic
    const authModal = document.getElementById('authModal');
    const openBtn = document.getElementById('openAuthModalBtn');
    const closeBtn = document.getElementById('closeAuthModalBtn');

    if (openBtn && authModal && closeBtn) {
        openBtn.addEventListener('click', () => {
            authModal.classList.add('active');
            // Check body for elements that might conflict if needed
            document.body.style.overflow = 'hidden';
        });

        closeBtn.addEventListener('click', () => {
            authModal.classList.remove('active');
            document.body.style.overflow = '';
        });

        // Close when clicking outside of modal content
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                authModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Tabs Logic (Student / Admin)
    const tabBtns = document.querySelectorAll('.tab-btn');
    const authSections = document.querySelectorAll('.auth-section');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all tabs & sections
            tabBtns.forEach(t => t.classList.remove('active'));
            authSections.forEach(s => s.classList.remove('active'));

            // Activate clicked tab
            btn.classList.add('active');
            
            // Activate corresponding section
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Form Toggle Logic (Login / Register inside Student Section)
    const formToggles = document.querySelectorAll('.auth-toggle');
    const authForms = document.querySelectorAll('.auth-form');

    formToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            if(!toggle.closest('#student-auth')) return; // Ensure scoping to student section
            
            // Remove active from all toggles
            formToggles.forEach(t => t.classList.remove('active'));
            // Remove active from student forms
            document.getElementById('student-auth').querySelectorAll('.auth-form').forEach(f => {
                f.classList.remove('active');
            });

            // Make clicked toggle active
            toggle.classList.add('active');
            // Show corresponding form
            const targetForm = toggle.getAttribute('data-form');
            document.getElementById(targetForm).classList.add('active');
        });
    });

    // Check URL parameters for showing flash messages / opening modal
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('show_login') || urlParams.get('show_register')) {
        if(authModal) {
            authModal.classList.add('active');
        }
        
        if (urlParams.get('show_register')) {
            const registerToggle = document.querySelector('[data-form="student-register"]');
            if (registerToggle) registerToggle.click();
        }
    }
});
