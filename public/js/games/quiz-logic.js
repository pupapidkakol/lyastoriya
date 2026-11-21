export function shuffle(array) {
    const result = array.slice();

    for (let i = result.length - 1; i > 0; i--) {
        const random = new Uint32Array(1);
        crypto.getRandomValues(random);

        const j = random[0] % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

export function isCorrect(question, selectedAnswer) {
    if (Object.prototype.hasOwnProperty.call(question, 'correctAnswerId')) {
        return selectedAnswer.Answerid === question.correctAnswerId;
    }
    if (typeof question.correct === 'string') {
        return selectedAnswer.id === question.correct;
    }
    return selectedAnswer.correct === true;
}

export function calculateScore(results) {
    return results.filter(Boolean).length;
}