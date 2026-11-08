window.currentUserPromise.then(function (data) {
    if (!data || !data.user) {
        document.getElementById('profileRoot').textContent = 'Спочатку увійдіть у систему.';
        return;
    }

    document.querySelector('.profile__name').textContent = data.user.username;
    showStats(data.stats);
}).catch(function (error) {
    console.error(error);
    document.getElementById('profileRoot').textContent = 'Не вдалося завантажити профіль.';
});