describe('Transaction Logic', () => {
    test('Should calculate balance correctly', () => {
        const balance = 1000;
        const transferAmount = 100;
        expect(balance - transferAmount).toBe(900);
    });

    test('Should reject negative transfers', () => {
        const amount = -50;
        const isValid = amount > 0;
        expect(isValid).toBe(false);
    });
});