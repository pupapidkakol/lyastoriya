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

export function calcResult(score, total) {
    return {
        score: score,
        total: total,
        percent: total > 0 ? Math.round(score / total * 100) : 0
    };
}

export function isValidQuestionBank(questions) {
    return Array.isArray(questions) && questions.every((question) => {
        if (!question || typeof question.text !== 'string' || !question.text.trim()) return false;
        if (!Array.isArray(question.options) || question.options.length < 2) return false;
        if (!question.options.every((option) => option && typeof option.text === 'string' && option.text.trim())) return false;

        if (typeof question.correct === 'string') {
            return question.options.every((option) => typeof option.id === 'string' && option.id) &&
                question.options.some((option) => option.id === question.correct);
        }
        if (Object.prototype.hasOwnProperty.call(question, 'correctAnswerId')) {
            return question.options.every((option) => option.Answerid != null) &&
                question.options.some((option) => option.Answerid === question.correctAnswerId);
        }
        return question.options.some((option) => option && option.correct === true);
    });
}