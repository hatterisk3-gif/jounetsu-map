const matrix1 = new DOMMatrix().translate(100, 0).scale(4);
const matrix2 = new DOMMatrix().scale(4).translate(100, 0);
console.log('translate(100).scale(4):', matrix1);
console.log('scale(4).translate(100):', matrix2);
