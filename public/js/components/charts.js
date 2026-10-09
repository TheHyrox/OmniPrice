const Charts = {
    chart: null,
    products: [],

    init(products) {
        this.products = products;
        this.render(30);
    },

    render(days = 30) {
        const ctx = document.getElementById('globalChart');
        if (!ctx) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const colors = [
            '#0071e3', '#34c759', '#ff9500', '#ff3b30', '#5856d6', 
            '#00c7be', '#ff2d55', '#64d2ff', '#bf5af2', '#ffd60a'
        ];

        const allDates = new Set();
        this.products.forEach(product => {
            product.priceHistory
                .filter(h => new Date(h.date) >= cutoffDate)
                .forEach(h => {
                    const dateStr = new Date(h.date).toISOString().split('T')[0];
                    allDates.add(dateStr);
                });
        });

        const sortedDates = Array.from(allDates).sort();
        const labels = sortedDates.map(d => {
            const date = new Date(d);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const datasets = this.products.map((product, index) => {
            const data = sortedDates.map(dateStr => {
                const historyEntry = product.priceHistory.find(h => {
                    const entryDate = new Date(h.date).toISOString().split('T')[0];
                    return entryDate === dateStr;
                });

                if (!historyEntry || !historyEntry.prices.length) return null;

                const prices = historyEntry.prices.map(p => p.price).filter(p => p !== null);
                return prices.length > 0 ? Math.min(...prices) : null;
            });

            return {
                label: product.title,
                data,
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length] + '20',
                borderWidth: 2,
                fill: false,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 6,
                spanGaps: true
            };
        });

        const allPrices = datasets.flatMap(ds => ds.data.filter(p => p !== null));
        const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
        const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 100;
        const padding = (maxPrice - minPrice) * 0.1;

        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: (context) => {
                                if (context.raw == null) return null;
                                return `${context.dataset.label}: €${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: Math.max(0, minPrice - padding),
                        max: maxPrice + padding,
                        ticks: {
                            callback: (value) => '€' + value.toFixed(0)
                        }
                    }
                }
            }
        });
    },

    updateTimeframe(days) {
        document.querySelectorAll('#charts-tab .tf-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.range) === days);
        });
        this.render(days);
    }
};
