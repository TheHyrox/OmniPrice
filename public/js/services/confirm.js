/**
 * OmniPrice - Modern Confirmation Dialog
 * Replaces native window.confirm() with a sleek Promise-based custom dialog.
 */
const Confirm = (() => {
    let dialogModal = null;

    function createModal() {
        if (dialogModal && document.body.contains(dialogModal)) {
            return dialogModal;
        }

        const modal = document.createElement('div');
        modal.id = 'confirmDialogModal';
        modal.className = 'modal confirm-modal';
        modal.innerHTML = `
            <div class="modal-content confirm-modal-content">
                <div class="confirm-modal-header">
                    <div class="confirm-icon" id="confirmDialogIcon">⚠</div>
                    <h3 id="confirmDialogTitle" class="confirm-title">Are you sure?</h3>
                </div>
                <p id="confirmDialogMessage" class="confirm-message"></p>
                <div class="confirm-modal-actions">
                    <button type="button" class="btn btn-ghost" id="confirmDialogCancel">Cancel</button>
                    <button type="button" class="btn btn-primary" id="confirmDialogConfirm">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        dialogModal = modal;
        return modal;
    }

    /**
     * Prompts the user with a confirmation dialog.
     * @param {Object} options
     * @param {string} [options.title='Confirm Action']
     * @param {string} options.message
     * @param {string} [options.confirmText='Confirm']
     * @param {string} [options.cancelText='Cancel']
     * @param {boolean} [options.danger=false]
     * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled.
     */
    function ask({
        title = 'Confirm Action',
        message = 'Are you sure you want to proceed?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        danger = false
    } = {}) {
        return new Promise((resolve) => {
            const modal = createModal();
            const titleElem = modal.querySelector('#confirmDialogTitle');
            const msgElem = modal.querySelector('#confirmDialogMessage');
            const iconElem = modal.querySelector('#confirmDialogIcon');
            const confirmBtn = modal.querySelector('#confirmDialogConfirm');
            const cancelBtn = modal.querySelector('#confirmDialogCancel');

            titleElem.textContent = title;
            msgElem.textContent = message;
            confirmBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            if (danger) {
                confirmBtn.className = 'btn btn-danger';
                iconElem.textContent = '🗑';
                iconElem.className = 'confirm-icon danger';
            } else {
                confirmBtn.className = 'btn btn-primary';
                iconElem.textContent = 'ℹ';
                iconElem.className = 'confirm-icon primary';
            }

            modal.classList.add('active');

            const cleanup = () => {
                modal.classList.remove('active');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                modal.removeEventListener('click', onBackdropClick);
                document.removeEventListener('keydown', onKeyDown);
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            const onBackdropClick = (e) => {
                if (e.target === modal) {
                    cleanup();
                    resolve(false);
                }
            };

            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(false);
                } else if (e.key === 'Enter') {
                    cleanup();
                    resolve(true);
                }
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            modal.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKeyDown);

            // Focus confirm button for keyboard navigation
            setTimeout(() => confirmBtn.focus(), 50);
        });
    }

    return {
        ask
    };
})();

window.Confirm = Confirm;
window.showConfirm = (options) => Confirm.ask(options);
