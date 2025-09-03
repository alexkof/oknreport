// Конфигурация
const SPREADSHEET_ID = '1o7-XTymP0__T2fNd0wYuw3NrrCCX8GlvOThlj8UHwAA';
const SHEET_NAME = 'Данные';
const API_KEY = '';

// Элементы DOM
const totalObjectsEl = document.getElementById('totalObjects');
const goodCountEl = document.getElementById('goodCount');
const normalCountEl = document.getElementById('normalCount');
const badCountEl = document.getElementById('badCount');
const ruinsCountEl = document.getElementById('ruinsCount');
const notExistsCountEl = document.getElementById('notExistsCount');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');

// Маппинг иконок на изображения
const iconImages = {
    'Мост': './images/bridge.svg',
    'Церковь': './images/church.svg',
    'Дворец': './images/palace.svg',
    'Домик': './images/house.svg',
    'Многоэтажка': './images/apartment.svg',
    'Ворота': './images/gate.svg',
    'Сарай': './images/barn.svg',
    'Ансамбль': './images/ensemble.svg'
};

// Глобальные переменные
let allObjects = [];
let currentObjects = [];

// Функция для получения URL Google Sheets API
function getGoogleSheetsUrl() {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
}

// Функция для парсинга CSV данных
function parseCSV(csvText) {
    console.log('Полученные CSV данные:', csvText.substring(0, 500) + '...');
    
    const lines = csvText.split('\n');
    console.log('Количество строк:', lines.length);
    
    if (lines.length === 0) {
        console.error('CSV файл пустой');
        return [];
    }
    
    // Функция для правильного разбора CSV строки
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result.map(item => item.replace(/^"|"$/g, ''));
    }
    
    const headers = parseCSVLine(lines[0]);
    console.log('Заголовки:', headers);
    
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
    }
    
    console.log('Обработанные данные (первые 3 строки):', data.slice(0, 3));
    return data;
}

// Функция для определения состояния объекта
function getCondition(status) {
    if (!status) return 'unknown';
    
    const statusLower = status.toLowerCase().trim();
    
    if (statusLower === 'готово' || statusLower === 'хорошее' || statusLower.includes('хорош') || statusLower.includes('нормальн')) return 'good';
    if (statusLower === 'проверяем' || statusLower.includes('проверя') || statusLower.includes('удовлетворительн')) return 'normal';
    if (statusLower === 'плохое' || statusLower.includes('плох') || statusLower.includes('неудовлетворительн')) return 'bad';
    if (statusLower === 'руины' || statusLower.includes('руин')) return 'ruins';
    if (statusLower === 'не существует' || statusLower.includes('не существует')) return 'not-exists';
    
    return 'normal'; // По умолчанию нормальное состояние
}

// Функция для определения периода по году
function getPeriod(year) {
    if (!year || year === '') return 'after-1940';
    
    // Извлекаем числовое значение года
    const yearStr = year.toString().toLowerCase();
    let yearNum;
    
    if (yearStr.includes('конец') && yearStr.includes('xix')) {
        yearNum = 1890;
    } else if (yearStr.includes('начало') && yearStr.includes('xix')) {
        yearNum = 1810;
    } else if (yearStr.includes('середина') && yearStr.includes('xix')) {
        yearNum = 1850;
    } else if (yearStr.includes('вторая половина') && yearStr.includes('xix')) {
        yearNum = 1870;
    } else if (yearStr.includes('первая половина') && yearStr.includes('xix')) {
        yearNum = 1830;
    } else {
        // Пытаемся найти первые 4 цифры
        const match = yearStr.match(/\d{4}/);
        if (match) {
            yearNum = parseInt(match[0]);
        } else {
            return 'after-1940'; // По умолчанию
        }
    }
    
    if (yearNum < 1800) return 'before-1800';
    if (yearNum >= 1800 && yearNum < 1850) return '1800-1850';
    if (yearNum >= 1850 && yearNum < 1880) return '1850-1880';
    if (yearNum >= 1880 && yearNum < 1900) return '1880-1900';
    if (yearNum >= 1900 && yearNum < 1940) return '1900-1940';
    return 'after-1940';
}

// Функция для получения эмодзи иконки
function getIconEmoji(iconType) {
    const emojiMap = {
        'Мост': '🌉',
        'Церковь': '⛪',
        'Дворец': '🏛️',
        'Домик': '🏠',
        'Многоэтажка': '🏢',
        'Ворота': '🚪',
        'Сарай': '🏚️',
        'Ансамбль': '🏘️'
    };
    
    return emojiMap[iconType] || '🏢';
}

// Функция для анализа данных
function analyzeData(data) {
    console.log('Анализируем данные, всего строк:', data.length);
    
    const stats = {
        total: 0,
        good: 0,
        normal: 0,
        bad: 0,
        ruins: 0,
        'not-exists': 0
    };
    
    const objects = [];
    
    data.forEach((row, index) => {
        const cityValue = row['Город'] || row['A'] || '';
        
        if (cityValue && cityValue.trim() !== '' && cityValue.toLowerCase().includes('каменск')) {
            stats.total++;
            
            const iconValue = row['Иконка'] || 'Домик';
            const condition = getCondition(row['Статус'] || row['Состояние'] || '');
            const year = row['Год'] || '';
            const period = getPeriod(year);
            
            const object = {
                id: row['Номер'] || index,
                name: row['Название'] || row['C'] || 'Объект культурного наследия',
                year: year,
                period: period,
                condition: condition,
                icon: iconValue,
                address: row['Адрес'] || row['D'] || '',
                status: row['Статус'] || row['Состояние'] || 'не указан',
                telegramLink: row['Пост'] || '#',
                number: row['Номер'] || ''
            };
            
            objects.push(object);
            
            if (stats.hasOwnProperty(condition)) {
                stats[condition]++;
            }
        }
    });
    
    console.log('Итоговая статистика:', stats);
    console.log('Объекты:', objects);
    
    return { stats, objects };
}

// Функция для создания карточки объекта
function createObjectCard(object) {
    const card = document.createElement('div');
    card.className = `object-card ${object.condition}`;
    card.dataset.objectId = object.id;
    
    // Определяем, нужно ли показывать изображение или иконку
    const iconType = object.icon || 'Домик';
    const imageUrl = iconImages[iconType];
    
    if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'object-image';
        image.src = imageUrl;
        image.alt = iconType;
        image.onerror = function() {
            this.style.display = 'none';
            const icon = document.createElement('div');
            icon.className = 'object-icon';
            icon.textContent = getIconEmoji(iconType);
            card.insertBefore(icon, card.firstChild);
        };
        card.appendChild(image);
    } else {
        const icon = document.createElement('div');
        icon.className = 'object-icon';
        icon.textContent = getIconEmoji(iconType);
        card.appendChild(icon);
    }
    
    // Добавляем обработчик клика для открытия модального окна
    card.addEventListener('click', () => showObjectModal(object));
    
    return card;
}

// Функция для отображения объектов в сетке по периодам
function displayObjectsGrid(objects) {
    // Очищаем все периоды
    const periodIds = ['before-1800', '1800-1850', '1850-1880', '1880-1900', '1900-1940', 'after-1940'];
    periodIds.forEach(periodId => {
        const container = document.getElementById(`period-${periodId}`);
        if (container) {
            container.innerHTML = '';
        }
    });
    
    // Группируем объекты по периодам
    const objectsByPeriod = {};
    objects.forEach(object => {
        const period = object.period;
        if (!objectsByPeriod[period]) {
            objectsByPeriod[period] = [];
        }
        objectsByPeriod[period].push(object);
    });
    
    // Отображаем объекты в соответствующих периодах
    Object.keys(objectsByPeriod).forEach(period => {
        const container = document.getElementById(`period-${period}`);
        if (container) {
            objectsByPeriod[period].forEach(object => {
                const card = createObjectCard(object);
                container.appendChild(card);
            });
            
            // Скрываем периоды без объектов
            const periodGroup = container.closest('.period-group');
            if (objectsByPeriod[period].length === 0) {
                periodGroup.style.display = 'none';
            } else {
                periodGroup.style.display = 'block';
            }
        }
    });
}

// Функция для отображения модального окна
function showObjectModal(object) {
    const modal = document.getElementById('objectModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalPeriod = document.getElementById('modalPeriod');
    const modalIcon = document.getElementById('modalIcon');
    const modalAddress = document.getElementById('modalAddress');
    const modalStatus = document.getElementById('modalStatus');
    const modalYear = document.getElementById('modalYear');
    const modalNumber = document.getElementById('modalNumber');
    const modalTelegramLink = document.getElementById('modalTelegramLink');
    const modalPhoto = document.getElementById('modalPhoto');
    
    // Заполняем данные
    modalTitle.textContent = object.name;
    modalPeriod.textContent = object.period.replace('-', '—');
    modalAddress.textContent = object.address;
    modalStatus.textContent = object.status;
    modalYear.textContent = object.year || 'не указан';
    modalNumber.textContent = object.number || 'не указан';
    
    // Иконка
    const iconType = object.icon || 'Домик';
    const imageUrl = iconImages[iconType];
    if (imageUrl) {
        modalIcon.src = imageUrl;
        modalIcon.alt = iconType;
    }
    
    // Ссылка на Telegram
    if (object.telegramLink && object.telegramLink !== '#') {
        modalTelegramLink.href = object.telegramLink;
        modalTelegramLink.style.display = 'inline-flex';
    } else {
        modalTelegramLink.style.display = 'none';
    }
    
    // Скрываем фото пока что (можно добавить позже)
    modalPhoto.style.display = 'none';
    
    // Показываем модальное окно
    modal.classList.add('show');
    modal.style.display = 'flex';
    
    // Блокируем скролл страницы
    document.body.style.overflow = 'hidden';
}

// Функция для закрытия модального окна
function closeModal() {
    const modal = document.getElementById('objectModal');
    modal.classList.remove('show');
    
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }, 300);
}

// Функция для обновления UI
function updateUI(data) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    
    // Сохраняем данные глобально
    allObjects = data.objects;
    currentObjects = data.objects;
    
    // Обновляем общую статистику
    animateNumber(totalObjectsEl, data.stats.total);
    animateNumber(goodCountEl, data.stats.good);
    animateNumber(normalCountEl, data.stats.normal);
    animateNumber(badCountEl, data.stats.bad);
    animateNumber(ruinsCountEl, data.stats.ruins);
    animateNumber(notExistsCountEl, data.stats['not-exists']);
    
    // Отображаем объекты в гриде
    displayObjectsGrid(data.objects);
}

// Функция для анимации чисел
function animateNumber(element, targetValue) {
    const duration = 2000;
    const startValue = 0;
    const startTime = performance.now();
    
    function updateNumber(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOutQuart);
        
        element.textContent = currentValue.toLocaleString('ru-RU');
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        }
    }
    
    requestAnimationFrame(updateNumber);
}

// Функция для показа ошибки
function showError(message) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.querySelector('#errorMessage').textContent = message;
    console.error('Ошибка загрузки данных:', message);
}

// Основная функция загрузки данных
async function loadData() {
    try {
        console.log('Начинаем загрузку данных...');
        
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        
        const url = getGoogleSheetsUrl();
        console.log('URL для загрузки:', url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(url, {
            signal: controller.signal,
            method: 'GET',
            headers: {
                'Accept': 'text/csv,application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        console.log('Ответ сервера:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        
        if (!csvText || csvText.trim() === '') {
            throw new Error('Получены пустые данные');
        }
        
        const data = parseCSV(csvText);
        
        if (data.length === 0) {
            throw new Error('Данные не найдены');
        }
        
        const analyzedData = analyzeData(data);
        updateUI(analyzedData);
        
    } catch (error) {
        console.error('Полная ошибка:', error);
        console.log('Переключаемся на тестовые данные...');
        
        // Если не удалось загрузить данные из Google Sheets, используем тестовые данные
        if (typeof loadTestData === 'function') {
            loadTestData();
        } else {
            if (error.name === 'AbortError') {
                showError('Таймаут загрузки данных. Проверьте интернет-соединение.');
            } else {
                showError(error.message + ' (Используйте тестовые данные для демонстрации)');
            }
        }
    }
}

// Функция для автоматического обновления данных
function startAutoRefresh() {
    setInterval(loadData, 5 * 60 * 1000); // каждые 5 минут
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    console.log('Страница загружена, начинаем загрузку данных...');
    loadData();
    startAutoRefresh();
    
    // Обработчики для кнопок фильтров
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Пока что только фильтр по состоянию работает
            if (tab.dataset.filter === 'condition') {
                // Показываем все объекты
                displayObjectsGrid(allObjects);
            }
        });
    });
    
    // Обработчики для кнопок просмотра
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Пока что только списочный вид работает
            if (btn.dataset.view === 'list') {
                displayObjectsGrid(currentObjects);
            }
        });
    });
    
    // Обработчик ESC для закрытия модального окна
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});

// Глобальная функция для повторной загрузки (для кнопки "Повторить")
window.loadData = loadData;
window.closeModal = closeModal;