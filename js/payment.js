// payment.js - FIXED VERSION dengan Firebase integration
import firebaseDB from './firebase-db.js';

class PaymentSystem {
    constructor() {
        this.checkoutData = null;
        this.paymentTimer = null;
        this.currentUser = null;
        this.authReady = false;
        
        this.init();
    }

    async init() {
        console.log('💳 Initializing payment system');
        
        try {
            // Tunggu DOM ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            console.log('💳 DOM ready, waiting for auth system...');
            
            // TUNGGU AUTH SYSTEM SIAP
            await this.waitForAuthSystem();
            
            // Load dan render data
            this.loadCheckoutData();
            this.setupEventListeners();
            this.startPaymentTimer();
            
            // Simpan ke Firebase JIKA user login
            if (this.isUserLoggedIn()) {
                console.log('💳 User logged in, saving to Firebase...');
                await this.saveCompleteOrderToFirebase();
            } else {
                console.log('💳 User not logged in, skip Firebase save');
            }
            
        } catch (error) {
            console.error('💳 Error during payment initialization:', error);
            // Fallback tanpa auth
            this.loadCheckoutData();
            this.setupEventListeners();
            this.startPaymentTimer();
        }
    }

    /**
     * 🔐 Tunggu auth system siap dengan timeout
     */
    async waitForAuthSystem(maxWait = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const checkAuth = () => {
                console.log('💳 Checking auth status...');
                
                // Cek multiple sources untuk user data
                const userData = localStorage.getItem('currentUser');
                if (userData) {
                    try {
                        this.currentUser = JSON.parse(userData);
                        console.log('💳 User found in localStorage:', this.currentUser);
                        this.authReady = true;
                        resolve();
                        return;
                    } catch (e) {
                        console.warn('💳 Error parsing user data:', e);
                    }
                }
                
                // Cek auth system global
                if (window.authSystem && window.authSystem.currentUser) {
                    this.currentUser = window.authSystem.currentUser;
                    console.log('💳 User from auth system:', this.currentUser);
                    this.authReady = true;
                    resolve();
                    return;
                }
                
                // Cek firebase auth langsung
                if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                    this.currentUser = window.firebaseAuth.currentUser;
                    console.log('💳 User from Firebase auth:', this.currentUser);
                    this.authReady = true;
                    resolve();
                    return;
                }
                
                // Timeout check
                if (Date.now() - startTime > maxWait) {
                    console.warn('💳 Auth system timeout, continuing without auth');
                    this.currentUser = null;
                    this.authReady = true;
                    resolve();
                    return;
                }
                
                // Continue polling
                setTimeout(checkAuth, 500);
            };
            
            checkAuth();
        });
    }

    /**
     * 🔍 Cek apakah user login
     */
    isUserLoggedIn() {
        const isLoggedIn = this.currentUser !== null && 
                          this.currentUser !== undefined && 
                          this.currentUser.uid;
        console.log('💳 User logged in check:', isLoggedIn);
        return isLoggedIn;
    }

    // ==================== INVOICE RENDERING ====================

    /**
     * 📄 Load checkout data dari localStorage
     */
    loadCheckoutData() {
        try {
            console.log('💳 Checking for checkout data...');
            
            const checkoutData = JSON.parse(localStorage.getItem('semart-checkout'));
            if (!checkoutData) {
                console.error('❌ No checkout data found');
                this.showError('Data checkout tidak ditemukan. Silakan kembali ke keranjang.');
                return;
            }

            console.log('💳 Raw checkout data:', checkoutData);

            // Process data sesuai struktur HTML
            const processedData = {
                ...checkoutData,
                shippingInfo: checkoutData.shippingInfo || checkoutData.userInfo || {},
                cart: checkoutData.cart || [],
                orderId: checkoutData.orderId || `INV-${Date.now()}`,
                expiryTime: checkoutData.expiryTime || this.getExpiryTime(),
                discount: checkoutData.discount || 0
            };

            console.log('💳 Processed checkout data:', processedData);

            // Validasi data penting
            if (!processedData.cart || !Array.isArray(processedData.cart) || processedData.cart.length === 0) {
                console.error('❌ Invalid cart data:', processedData.cart);
                this.showError('Keranjang belanja kosong. Silakan kembali ke keranjang.');
                return;
            }

            this.checkoutData = processedData;
            this.renderInvoice();
            
        } catch (error) {
            console.error('💳 Error loading checkout data:', error);
            this.showError('Terjadi kesalahan saat memuat data pembayaran: ' + error.message);
        }
    }

    /**
     * 🎨 Render invoice ke HTML
     */
    renderInvoice() {
        if (!this.checkoutData) {
            console.error('💳 No checkout data available for rendering');
            return;
        }

        try {
            console.log('💳 Starting invoice rendering');
            
            const { cart, discount, shippingInfo, orderId, expiryTime } = this.checkoutData;
            
            // Calculate totals
            const subtotal = cart.reduce((sum, item) => {
                const price = Number(item.price) || 0;
                const quantity = Number(item.quantity) || 1;
                return sum + (price * quantity);
            }, 0);
            
            const shipping = 0;
            const total = Math.max(0, subtotal - (Number(discount) || 0) + shipping);

            console.log('💳 Calculated totals:', { subtotal, discount, shipping, total });

            // Set invoice data
            this.setElementContent('invoice-order-id', orderId);
            this.setElementContent('invoice-date', new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }));
            this.setElementContent('order-date', new Date().toLocaleDateString('id-ID'));

            // Customer info
            this.setElementContent('customer-name', shippingInfo.recipientName || 'Tidak tersedia');
            this.setElementContent('customer-phone', shippingInfo.recipientPhone || 'Tidak tersedia');
            this.setElementContent('customer-address', shippingInfo.shippingAddress || 'Tidak tersedia');
            this.setElementContent('customer-city', 
                `${shippingInfo.city || ''} ${shippingInfo.postalCode || ''}`.trim() || 'Tidak tersedia');

            // Render products table
            this.renderProductsTable(cart);

            // Render totals
            this.setElementContent('invoice-subtotal', `Rp${subtotal.toLocaleString('id-ID')}`);
            this.setElementContent('invoice-total', `Rp${total.toLocaleString('id-ID')}`);
            this.setElementContent('invoice-shipping', `Rp${shipping.toLocaleString('id-ID')}`);
            this.setElementContent('va-amount', `Rp${total.toLocaleString('id-ID')}`);

            // Handle discount
            if (discount > 0) {
                const discountRow = document.getElementById('invoice-discount-row');
                if (discountRow) {
                    discountRow.style.display = 'flex';
                    this.setElementContent('invoice-discount', `-Rp${discount.toLocaleString('id-ID')}`);
                }
            }

            // Expiry time
            const expiryDate = new Date(expiryTime);
            const formattedExpiry = expiryDate.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            this.setElementContent('payment-expiry', formattedExpiry);
            this.setElementContent('expiry-time', formattedExpiry);

            console.log('✅ DOM rendering completed');

        } catch (error) {
            console.error('💳 Error rendering invoice:', error);
            this.showError(`Gagal menampilkan invoice: ${error.message}`);
        }
    }

    /**
     * 📊 Render products table
     */
    renderProductsTable(cart) {
        const tbody = document.getElementById('invoice-products-body');
        if (!tbody) {
            console.error('❌ invoice-products-body not found');
            return;
        }

        if (cart && cart.length > 0) {
            tbody.innerHTML = cart.map(item => `
                <tr>
                    <td>
                        <strong>${item.name || 'Produk'}</strong>
                    </td>
                    <td>Rp${(item.price || 0).toLocaleString('id-ID')}</td>
                    <td>${item.quantity || 1}</td>
                    <td>Rp${((item.price || 0) * (item.quantity || 1)).toLocaleString('id-ID')}</td>
                </tr>
            `).join('');
            console.log(`✅ Rendered ${cart.length} products`);
        } else {
            tbody.innerHTML = '<tr><td colspan="4">Tidak ada produk</td></tr>';
        }
    }

    /**
     * 🔧 Set element text dengan safety check
     */
    setElementContent(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`⚠️ Element ${id} not found`);
        }
    }

    // ==================== PDF & PRINT FUNCTIONALITY ====================

    /**
     * 📄 Download invoice sebagai PDF - OPTIMIZED
     */
    async downloadPDF() {
        try {
            const invoiceContent = document.getElementById('invoice-content');
            if (!invoiceContent) {
                throw new Error('Invoice content not found');
            }

            // Show loading
            const downloadBtn = document.getElementById('download-pdf');
            const originalText = downloadBtn?.textContent || 'Download PDF Invoice';
            if (downloadBtn) {
                downloadBtn.textContent = 'Membuat PDF...';
                downloadBtn.disabled = true;
            }

            console.log('💾 Starting PDF generation...');

            // Buat container untuk PDF
            const pdfContainer = this.createPDFContainer(invoiceContent);
            document.body.appendChild(pdfContainer);

            // Generate canvas
            const canvas = await html2canvas(pdfContainer, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            // Hapus container temporary
            document.body.removeChild(pdfContainer);

            // Create PDF
            const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const imgWidth = pdfWidth - 20;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(canvas.toDataURL('image/jpeg', 0.8), 'JPEG', 10, 10, imgWidth, imgHeight);
            
            // Save PDF
            const orderId = this.checkoutData?.orderId || 'invoice';
            const fileName = `invoice-${orderId}.pdf`;
            pdf.save(fileName);

            // Show success message
            this.showMessage('PDF berhasil didownload!', 'success');

        } catch (error) {
            console.error('💳 Error downloading PDF:', error);
            this.showMessage('Gagal membuat PDF. Silakan gunakan print browser.', 'error');
        } finally {
            // Reset button state
            const downloadBtn = document.getElementById('download-pdf');
            if (downloadBtn) {
                downloadBtn.textContent = 'Download PDF Invoice';
                downloadBtn.disabled = false;
            }
        }
    }

    /**
     * 📄 Buat container untuk PDF
     */
    createPDFContainer(originalElement) {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            left: -9999px;
            top: -9999px;
            width: 800px;
            background: white;
            padding: 20px;
            font-family: 'Poppins', sans-serif;
        `;
        
        const clonedElement = originalElement.cloneNode(true);
        
        // Hapus element yang tidak perlu
        const elementsToRemove = clonedElement.querySelectorAll(
            '.btn-download, .btn-print, .btn-check-status, .action-buttons, .backpage'
        );
        elementsToRemove.forEach(el => el.remove());
        
        container.appendChild(clonedElement);
        return container;
    }

    // ==================== PAYMENT TIMER & STATUS ====================

    /**
     * ⏰ Start payment countdown timer
     */
    startPaymentTimer() {
        if (!this.checkoutData || !this.checkoutData.expiryTime) return;

        const updateTimer = () => {
            const now = new Date().getTime();
            const expiry = new Date(this.checkoutData.expiryTime).getTime();
            const timeLeft = expiry - now;

            if (timeLeft <= 0) {
                this.setElementContent('payment-timer', '00:00:00');
                if (this.paymentTimer) {
                    clearInterval(this.paymentTimer);
                }
                this.handlePaymentExpired();
                return;
            }

            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

            this.setElementContent('payment-timer', 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };

        updateTimer();
        this.paymentTimer = setInterval(updateTimer, 1000);
    }

    /**
     * 🔍 Check payment status
     */
    async checkPaymentStatus() {
        try {
            if (!this.checkoutData?.orderId) {
                throw new Error('Order ID tidak ditemukan');
            }

            this.showMessage('Sedang memeriksa status pembayaran...', 'info');

            // Simulasi check status
            setTimeout(() => {
                this.showMessage('Status: Menunggu konfirmasi pembayaran', 'info');
            }, 2000);

        } catch (error) {
            console.error('💳 Error checking payment status:', error);
            this.showMessage('Gagal memeriksa status pembayaran. Silakan coba lagi.', 'error');
        }
    }

    /**
     * ⏰ Handle payment expired
     */
    async handlePaymentExpired() {
        this.showMessage('Waktu pembayaran telah habis. Silakan buat pesanan baru.', 'warning');
        
        setTimeout(() => {
            window.location.href = 'cart.html';
        }, 5000);
    }

    // ==================== FIREBASE INTEGRATION ====================

    /**
     * 💾 Simpan data lengkap ke Firebase dengan validasi
     */
    async saveCompleteOrderToFirebase() {
        try {
            // Validasi data sebelum save
            if (!this.checkoutData) {
                console.error('💳 No checkout data available');
                return;
            }

            if (!this.isUserLoggedIn()) {
                console.log('💳 User not logged in, skip Firebase save');
                return;
            }

            if (!firebaseDB || typeof firebaseDB.saveOrder !== 'function') {
                console.error('💳 Firebase DB not available');
                return;
            }

            console.log('💳 Saving order to Firebase...');

            // Validasi cart data
            if (!this.checkoutData.cart || !Array.isArray(this.checkoutData.cart) || this.checkoutData.cart.length === 0) {
                console.error('💳 Invalid cart data:', this.checkoutData.cart);
                return;
            }

            // Prepare complete order data
            const completeOrderData = {
                // Order metadata
                orderId: this.checkoutData.orderId || `INV-${Date.now()}`,
                orderNumber: `ORDER-${this.checkoutData.orderId || Date.now()}`,
                userId: this.currentUser.uid,
                userEmail: this.currentUser.email || 'no-email',
                userName: this.currentUser.displayName || 
                         this.checkoutData.shippingInfo?.recipientName || 
                         'Customer',
                
                // Recipient info
                recipientInfo: {
                    name: this.checkoutData.shippingInfo?.recipientName || 'Customer',
                    phone: this.checkoutData.shippingInfo?.recipientPhone || '081234567890',
                    address: this.checkoutData.shippingInfo?.shippingAddress || 'Alamat tidak tersedia',
                    city: this.checkoutData.shippingInfo?.city || 'Kota',
                    postalCode: this.checkoutData.shippingInfo?.postalCode || '12345',
                    notes: this.checkoutData.shippingInfo?.orderNotes || 'Tidak ada catatan'
                },
                
                // Cart items dengan validasi
                items: this.checkoutData.cart.map((item, index) => ({
                    itemId: index + 1,
                    productId: item.id || `prod-${index}`,
                    productName: item.name || 'Product',
                    price: Number(item.price) || 0,
                    quantity: Number(item.quantity) || 1,
                    subtotal: (Number(item.price) || 0) * (Number(item.quantity) || 1),
                    image: item.image || 'images/placeholder-product.jpg'
                })),
                
                // Payment info
                paymentInfo: {
                    method: 'transfer_manual',
                    bankName: 'Bank Nusantara',
                    subtotal: this.getTotalAmount(),
                    discount: this.checkoutData.discount || 0,
                    shippingCost: 0,
                    totalAmount: Math.max(0, this.getTotalAmount() - (this.checkoutData.discount || 0)),
                    status: 'pending',
                    expiryTime: this.checkoutData.expiryTime || this.getExpiryTime(),
                    virtualAccount: '233110005'
                },
                
                // Status dan timestamps
                status: 'pending_payment',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            console.log('💳 Order data prepared for Firebase:', completeOrderData);

            // Save ke Firebase
            await firebaseDB.saveOrder(completeOrderData);
            console.log('💳 Order successfully saved to Firebase');

            // Tampilkan konfirmasi
            this.showMessage('Pesanan berhasil disimpan di database!', 'success');

        } catch (error) {
            console.error('💳 Error saving to Firebase:', error);
            this.showMessage('Gagal menyimpan pesanan ke database: ' + error.message, 'error');
        }
    }

    // ==================== EVENT LISTENERS ====================

    /**
     * 🎯 Setup event listeners
     */
    setupEventListeners() {
        // Download PDF
        const downloadBtn = document.getElementById('download-pdf');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadPDF());
        }

        // Check payment status
        const checkStatusBtn = document.getElementById('check-status');
        if (checkStatusBtn) {
            checkStatusBtn.addEventListener('click', () => this.checkPaymentStatus());
        }

        // Print button
        const printBtn = document.getElementById('print-invoice');
        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * 🧮 Hitung total amount
     */
    getTotalAmount() {
        if (!this.checkoutData) return 0;
        return this.checkoutData.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    /**
     * ⏱️ Get expiry time (24 jam dari sekarang)
     */
    getExpiryTime() {
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 24);
        return expiry.toISOString();
    }

    /**
     * 💬 Show message toast
     */
    showMessage(message, type = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: ${this.getToastColor(type)};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideInRight 0.3s ease;
            max-width: 300px;
            font-family: 'Poppins', sans-serif;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 5000);
    }

    /**
     * 🎨 Get toast color berdasarkan type
     */
    getToastColor(type) {
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        return colors[type] || colors.info;
    }

    /**
     * ❌ Show error message
     */
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            background: #f8d7da;
            color: #721c24;
            padding: 1.5rem;
            border-radius: 8px;
            margin: 2rem auto;
            border: 1px solid #f5c6cb;
            text-align: center;
            max-width: 500px;
        `;
        errorDiv.innerHTML = `
            <h4 style="margin: 0 0 1rem 0; color: #721c24;">⚠️ Terjadi Kesalahan</h4>
            <p style="margin: 0 0 1.5rem 0;">${message}</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <a href="cart.html" style="
                    background: #6c757d;
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 6px;
                    text-decoration: none;
                    font-weight: 500;
                ">Kembali ke Keranjang</a>
                <button onclick="location.reload()" style="
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                ">Refresh Halaman</button>
            </div>
        `;
        
        const container = document.querySelector('.payment-content');
        if (container) {
            container.innerHTML = '';
            container.appendChild(errorDiv);
        }
    }

    /**
     * 🐛 Debug data flow
     */
    debugDataFlow() {
        console.log('💳=== DEBUG DATA FLOW ===');
        console.log('💳 Checkout data from localStorage:', this.checkoutData);
        console.log('💳 Current user:', this.currentUser);
        console.log('💳 Firebase DB available:', !!firebaseDB);
        console.log('💳 Cart items:', this.checkoutData?.cart);
        console.log('💳 User logged in:', this.isUserLoggedIn());
        console.log('💳========================');
    }
}

// ==================== INITIALIZATION ====================

// Initialize payment system when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('💳 DOM loaded, initializing payment system');
    
    try {
        // Tunggu sedikit untuk memastikan libraries sudah di-load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        window.paymentSystem = new PaymentSystem();
        
        console.log('💳 Payment system initialized successfully');
        
    } catch (error) {
        console.error('💳 Error initializing payment system:', error);
    }
});

// Add CSS animations if not exists
if (!document.querySelector('#payment-animations')) {
    const style = document.createElement('style');
    style.id = 'payment-animations';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}
