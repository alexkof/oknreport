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
const objectsGridEl = document.getElementById('objectsGrid');

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

// Отладочная информация о доступных изображениях
console.log('Доступные изображения:', Object.keys(iconImages));

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
        return result.map(item => item.replace(/^"|"$/g, '')); // Убираем кавычки
    }
    
    const headers = parseCSVLine(lines[0]);
    console.log('Заголовки:', headers);
    
    // Проверяем, есть ли колонка "Иконка"
    const iconColumnIndex = headers.findIndex(h => h === 'Иконка');
    console.log('Индекс колонки "Иконка":', iconColumnIndex);
    
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
    
    if (statusLower === 'готово' || statusLower === 'хорошее') return 'good';
    if (statusLower === 'проверяем' || statusLower === 'нормальное') return 'normal';
    if (statusLower === 'плохое' || statusLower.includes('плох')) return 'bad';
    if (statusLower === 'руины' || statusLower.includes('руин')) return 'ruins';
    if (statusLower === 'не существует' || statusLower.includes('не существует')) return 'not-exists';
    
    return 'unknown';
}

// Функция для создания карточки объекта
function createObjectCard(object) {
    const card = document.createElement('div');
    card.className = `object-card ${object.condition}`;
    
    // Определяем, нужно ли показывать изображение или иконку
    const iconType = object.icon || 'Домик';
    const imageUrl = iconImages[iconType];
    
    console.log(`Создаем карточку для "${object.name}" с иконкой "${iconType}", URL: ${imageUrl}`);
    
    if (imageUrl) {
        // Создаем изображение
        const image = document.createElement('img');
        image.className = 'object-image';
        image.src = imageUrl;
        image.alt = iconType;
        image.onerror = function() {
            console.log(`Ошибка загрузки изображения для "${iconType}", показываем эмодзи`);
            // Если изображение не загрузилось, показываем иконку
            this.style.display = 'none';
            const icon = document.createElement('div');
            icon.className = 'object-icon';
            icon.textContent = getIconEmoji(iconType);
            card.insertBefore(icon, card.firstChild);
        };
        image.onload = function() {
            console.log(`Изображение для "${iconType}" успешно загружено`);
        };
        card.appendChild(image);
    } else {
        console.log(`Нет изображения для "${iconType}", показываем эмодзи`);
        // Создаем иконку
        const icon = document.createElement('div');
        icon.className = 'object-icon';
        icon.textContent = getIconEmoji(iconType);
        card.appendChild(icon);
    }
    
    // Название объекта
    const name = document.createElement('div');
    name.className = 'object-name';
    name.textContent = object.name || 'Объект культурного наследия';
    
    // Год (если есть)
    const year = document.createElement('div');
    year.className = 'object-year';
    year.textContent = object.year || '';
    
    card.appendChild(name);
    if (object.year) {
        card.appendChild(year);
    }
    
    // Добавляем tooltip с дополнительной информацией
    const tooltip = `${object.name}\n${object.address}\nГод: ${object.year || 'не указан'}`;
    card.title = tooltip;
    
    return card;
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
        // Ищем в колонке "Город" вместо колонки A
        const cityValue = row['Город'] || row['A'] || row['Каменск-Уральский'] || '';
        console.log(`Строка ${index + 1}: колонка Город = "${cityValue}"`);
        
        if (cityValue && cityValue.trim() !== '') {
            stats.total++;
            
            // Добавляем отладку для колонки "Иконка"
            const iconValue = row['Иконка'] || row['Icon'] || 'Домик';
            console.log(`Строка ${index + 1}: Иконка = "${iconValue}"`);
            
            // Проверяем, есть ли изображение для этой иконки
            const hasImage = iconImages.hasOwnProperty(iconValue);
            console.log(`Строка ${index + 1}: Есть изображение для "${iconValue}": ${hasImage}`);
            
            const object = {
                name: row['Название'] || row['C'] || 'Объект культурного наследия',
                year: row['Год'] || row['B'] || '',
                condition: getCondition(row['Статус'] || row['E'] || ''),
                icon: iconValue,
                address: row['Адрес'] || row['D'] || ''
            };
            
            objects.push(object);
            
            // Подсчитываем статистику по состоянию
            if (stats.hasOwnProperty(object.condition)) {
                stats[object.condition]++;
            }
        }
    });
    
    console.log('Итоговая статистика:', stats);
    console.log('Объекты:', objects);
    
    // Выводим все уникальные значения иконок
    const uniqueIcons = [...new Set(objects.map(obj => obj.icon))];
    console.log('Уникальные значения иконок:', uniqueIcons);
    
    return { stats, objects };
}

// Функция для отображения объектов в гриде
function displayObjectsGrid(objects) {
    objectsGridEl.innerHTML = '';
    
    objects.forEach(object => {
        const card = createObjectCard(object);
        objectsGridEl.appendChild(card);
    });
}

// Функция для обновления UI
function updateUI(data) {
    // Скрываем загрузку
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    
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
    const duration = 1000;
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
        if (error.name === 'AbortError') {
            showError('Таймаут загрузки данных. Проверьте интернет-соединение.');
        } else {
            showError(error.message);
        }
    }
}

// Функция для автоматического обновления данных
function startAutoRefresh() {
    setInterval(loadData, 5 * 60 * 1000);
}

// Обработчики для кнопок фильтров
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
        });
    });
    
    // Обработчики для кнопок просмотра
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
});

// Обработчик для кнопки "Повторить"
window.loadData = loadData;