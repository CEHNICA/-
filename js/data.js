// Data state
export let cards = [];
export let originalCards = [];
export let currentIndex = 0;
export let masteredCards = new Set();
export let isShuffleMode = false;

export function setCards(newCards) {
    cards = newCards;
}

export function setOriginalCards(newOriginalCards) {
    originalCards = newOriginalCards;
}

export function setCurrentIndex(index) {
    currentIndex = index;
}

export function toggleShuffleMode() {
    isShuffleMode = !isShuffleMode;
    return isShuffleMode;
}

export function addToMastered(id) {
    masteredCards.add(id);
}

export function removeFromMastered(id) {
    masteredCards.delete(id);
}

export function clearMastered() {
    masteredCards.clear();
}

export function parseCSV(text) {
    const data = [];
    let currentRow = [];
    let currentCell = '';
    let inQuote = false;

    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuote && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if (char === '\n' && !inQuote) {
            currentRow.push(currentCell.trim());
            if (currentRow.length >= 2) {
                data.push({ _id: data.length, q: currentRow[0], a: currentRow[1] });
            }
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.length >= 2) {
            data.push({ _id: data.length, q: currentRow[0], a: currentRow[1] });
        }
    }

    return data;
}
