// Gestion de la connexion
const formConnexion = document.getElementById('form-connexion');
if (formConnexion) {
    formConnexion.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const prenom = document.getElementById('prenom').value.trim();
        const motdepasse = document.getElementById('motdepasse').value;
        
        // Récupérer les utilisateurs
        const utilisateurs = JSON.parse(localStorage.getItem('utilisateurs') || '[]');
        
        // Vérifier si l'utilisateur existe
        const ok = utilisateurs.some(u => u.prenom === prenom && u.motdepasse === motdepasse);
        
        if (ok) {
            localStorage.setItem('utilisateurCourant', prenom);
            window.location.href = 'main_menu.html';
        } else {
            alert('Identifiants invalides.');
        }
    });
}

// Gestion de l'inscription
const formInscription = document.getElementById('form-inscription');
if (formInscription) {
    formInscription.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const prenom = document.getElementById('prenom').value.trim();
        const motdepasse = document.getElementById('motdepasse').value;
        
        // Vérifier que les champs ne sont pas vides
        if (!prenom || !motdepasse) {
            alert('Veuillez remplir tous les champs.');
            return;
        }
        
        // Récupérer les utilisateurs
        const utilisateurs = JSON.parse(localStorage.getItem('utilisateurs') || '[]');
        
        // Vérifier si l'utilisateur existe déjà
        const existe = utilisateurs.some(u => u.prenom === prenom);
        if (existe) {
            alert('Ce nom d\'utilisateur existe déjà.');
            return;
        }
        
        // Ajouter le nouvel utilisateur
        utilisateurs.push({ prenom: prenom, motdepasse: motdepasse });
        localStorage.setItem('utilisateurs', JSON.stringify(utilisateurs));
        
        // Connecter l'utilisateur
        localStorage.setItem('utilisateurCourant', prenom);
        window.location.href = 'main_menu.html';
    });
}