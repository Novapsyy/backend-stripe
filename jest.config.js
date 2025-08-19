module.exports = {
  // Environnement de test
  testEnvironment: 'node',
  
  // Patterns de fichiers de test
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Couverture de code (désactivée pour les tests initiaux)
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  
  // Fichiers à inclure dans la couverture
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!**/*.test.js',
    '!**/*.spec.js'
  ],
  
  // Seuils de couverture (ajustés pour les tests initiaux)
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 10,
      lines: 10,
      statements: 10
    }
  },
  
  // Configuration des mocks
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Timeout pour les tests
  testTimeout: 10000,
  
  // Variables d'environnement pour les tests
  setupFilesAfterEnv: [],
  
  // Transformation des modules
  transform: {},
  
  // Modules à ignorer
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/'
  ],
  
  // Configuration verbose pour plus de détails
  verbose: true,
  
  // Détection des fichiers ouverts
  detectOpenHandles: true,
  
  // Force la fermeture après les tests
  forceExit: true
};