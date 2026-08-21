document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            
            if (navLinks.classList.contains('active')) {
                mobileBtn.textContent = '✕';
            } else {
                mobileBtn.textContent = '☰';
            }
        });
    }

    // Hero Image Carousel
    const carouselContainer = document.getElementById('hero-carousel');
    if (carouselContainer) {
        const heroImages = [
            { src: "assets/images/new_uploaded_hero.png", alt: "System Dashboard Preview" },
            { src: "assets/images/photo_2026-08-20_10-27-36.jpg", alt: "POS System Dashboard" },
            { src: "assets/images/photo_2026-08-20_10-27-47.jpg", alt: "Inventory Management System" },
            { src: "assets/images/photo_2026-08-20_10-27-52.jpg", alt: "Booking Management System" },
            { src: "assets/images/photo_2026-08-20_10-27-56.jpg", alt: "Custom Business System" }
        ];

        // Clear existing static placeholder images only
        const existingImages = carouselContainer.querySelectorAll('.hero-carousel-img');
        existingImages.forEach(img => img.remove());

        const dotsContainer = document.getElementById('carousel-dots');

        // Preload and create elements
        const imageElements = [];
        const dotElements = [];
        heroImages.forEach((imgData, index) => {
            const img = document.createElement('img');
            img.src = imgData.src;
            img.alt = imgData.alt;
            img.className = 'hero-carousel-img';
            // Insert images at the beginning of the container so they are behind buttons
            carouselContainer.insertBefore(img, carouselContainer.firstChild);
            imageElements.push(img);

            if (dotsContainer) {
                const dot = document.createElement('button');
                dot.className = 'carousel-dot';
                dot.addEventListener('click', () => {
                    showImage(index);
                    startCarousel(); // Reset timer
                });
                dotsContainer.appendChild(dot);
                dotElements.push(dot);
            }
        });

        let currentIndex = 0;
        let carouselInterval;

        const showImage = (index) => {
            // Remove classes from all
            imageElements.forEach(img => {
                img.classList.remove('active', 'prev-img', 'next-img');
            });
            dotElements.forEach(dot => dot.classList.remove('active'));

            currentIndex = index;
            // Handle wrap around
            if (currentIndex >= imageElements.length) currentIndex = 0;
            if (currentIndex < 0) currentIndex = imageElements.length - 1;

            let prevIndex = currentIndex - 1;
            if (prevIndex < 0) prevIndex = imageElements.length - 1;
            
            let nextIndex = currentIndex + 1;
            if (nextIndex >= imageElements.length) nextIndex = 0;

            imageElements[currentIndex].classList.add('active');
            imageElements[prevIndex].classList.add('prev-img');
            imageElements[nextIndex].classList.add('next-img');
            
            if (dotElements[currentIndex]) {
                dotElements[currentIndex].classList.add('active');
            }
        };

        const startCarousel = () => {
            clearInterval(carouselInterval);
            carouselInterval = setInterval(() => {
                showImage(currentIndex + 1);
            }, 4000);
        };

        // Initialize first view
        showImage(0);

        // Start automatic rotation
        startCarousel();

        // Click side images to navigate
        imageElements.forEach((img, idx) => {
            img.addEventListener('click', () => {
                if (img.classList.contains('prev-img')) {
                    showImage(currentIndex - 1);
                    startCarousel();
                } else if (img.classList.contains('next-img')) {
                    showImage(currentIndex + 1);
                    startCarousel();
                }
            });
        });

        // Manual controls
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');

        if (prevBtn && nextBtn) {
            prevBtn.addEventListener('click', () => {
                showImage(currentIndex - 1);
                startCarousel(); // Reset timer
            });
            
            nextBtn.addEventListener('click', () => {
                showImage(currentIndex + 1);
                startCarousel(); // Reset timer
            });
        }
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                if (navLinks && navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                    mobileBtn.textContent = '☰';
                }
            }
        });
    });
});
