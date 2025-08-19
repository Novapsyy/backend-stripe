// shared/schemas.test.js
// Tests pour les schémas Zod

const {
  // Schémas de base
  uuidSchema,
  emailSchema,
  priceIdSchema,
  sessionIdSchema,
  paymentIntentIdSchema,
  customerIdSchema,
  invoiceIdSchema,

  // Schémas Membership
  createMembershipCheckoutSchema,
  membershipMetadataSchema,
  membershipDataSchema,

  // Schémas Training
  createTrainingCheckoutSchema,
  trainingMetadataSchema,
  trainingPurchaseDataSchema,

  // Schémas Payment
  createCheckoutSessionSchema,
  createInvoiceSchema,
  paymentAttestationSchema,

  // Schémas Contact
  contactFormSchema,

  // Schémas Prevention
  preventionRequestDataSchema,
  sendPreventionRequestSchema,

  // Schémas de paramètres
  userIdParamsSchema,
  membershipStatusParamsSchema,
  trainingDetailsParamsSchema,

  // Schémas de réponse
  successResponseSchema,
  errorResponseSchema,
  stripeSessionResponseSchema,
} = require('./schemas');

/**
 * Fonction utilitaire pour tester un schéma
 * @param {string} schemaName - Nom du schéma
 * @param {object} schema - Schéma Zod
 * @param {object} validData - Données valides
 * @param {object} invalidData - Données invalides
 */
function testSchema(schemaName, schema, validData, invalidData) {
  console.log(`\n🧪 Test du schéma: ${schemaName}`);
  
  // Test avec des données valides
  try {
    const result = schema.parse(validData);
    console.log(`✅ Données valides acceptées`);
  } catch (error) {
    console.log(`❌ Erreur inattendue avec données valides:`, error.message);
  }
  
  // Test avec des données invalides
  try {
    schema.parse(invalidData);
    console.log(`❌ Données invalides acceptées (ne devrait pas arriver)`);
  } catch (error) {
    console.log(`✅ Données invalides rejetées:`, error.issues[0]?.message || error.message);
  }
}

/**
 * Tests des schémas de base
 */
function testBaseSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS DE BASE ===');
  
  // Test UUID
  testSchema(
    'uuidSchema',
    uuidSchema,
    '123e4567-e89b-12d3-a456-426614174000',
    'invalid-uuid'
  );
  
  // Test Email
  testSchema(
    'emailSchema',
    emailSchema,
    'test@example.com',
    'invalid-email'
  );
  
  // Test Price ID
  testSchema(
    'priceIdSchema',
    priceIdSchema,
    'price_1234567890',
    'invalid_price_id'
  );
  
  // Test Session ID
  testSchema(
    'sessionIdSchema',
    sessionIdSchema,
    'cs_test_1234567890',
    'invalid_session_id'
  );
  
  // Test Payment Intent ID
  testSchema(
    'paymentIntentIdSchema',
    paymentIntentIdSchema,
    'pi_1234567890',
    'invalid_pi_id'
  );
}

/**
 * Tests des schémas Membership
 */
function testMembershipSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS MEMBERSHIP ===');
  
  // Test création checkout membership
  testSchema(
    'createMembershipCheckoutSchema',
    createMembershipCheckoutSchema,
    {
      priceId: 'price_1234567890',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      userType: 'individual'
    },
    {
      priceId: 'invalid_price',
      userId: 'invalid_uuid',
      userType: 'invalid_type'
    }
  );
  
  // Test métadonnées membership
  testSchema(
    'membershipMetadataSchema',
    membershipMetadataSchema,
    {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      userType: 'association',
      priceId: 'price_1234567890',
      type: 'membership',
      associationId: '123e4567-e89b-12d3-a456-426614174001'
    },
    {
      userId: 'invalid_uuid',
      userType: 'invalid_type',
      type: 'invalid_type'
    }
  );
}

/**
 * Tests des schémas Training
 */
function testTrainingSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS TRAINING ===');
  
  // Test création checkout training
  testSchema(
    'createTrainingCheckoutSchema',
    createTrainingCheckoutSchema,
    {
      priceId: 'price_1234567890',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      trainingId: '123e4567-e89b-12d3-a456-426614174001'
    },
    {
      priceId: 'invalid_price',
      userId: 'invalid_uuid'
      // trainingId manquant
    }
  );
  
  // Test métadonnées training
  testSchema(
    'trainingMetadataSchema',
    trainingMetadataSchema,
    {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      trainingId: '123e4567-e89b-12d3-a456-426614174001',
      priceId: 'price_1234567890',
      originalPrice: '100.00',
      discountedPrice: '80.00',
      isMember: 'true',
      type: 'training'
    },
    {
      userId: 'invalid_uuid',
      originalPrice: 'invalid_price',
      isMember: 'maybe',
      type: 'invalid_type'
    }
  );
}

/**
 * Tests des schémas Payment
 */
function testPaymentSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS PAYMENT ===');
  
  // Test création checkout session
  testSchema(
    'createCheckoutSessionSchema',
    createCheckoutSessionSchema,
    {
      priceId: 'price_1234567890',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      userEmail: 'test@example.com',
      type: 'membership'
    },
    {
      priceId: 'invalid_price',
      userEmail: 'invalid_email',
      type: 'invalid_type'
    }
  );
  
  // Test création facture
  testSchema(
    'createInvoiceSchema',
    createInvoiceSchema,
    {
      paymentIntentId: 'pi_1234567890',
      customerId: 'cus_1234567890'
    },
    {
      paymentIntentId: 'invalid_pi',
      customerId: 'invalid_customer'
    }
  );
}

/**
 * Tests des schémas Contact
 */
function testContactSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS CONTACT ===');
  
  // Test formulaire de contact
  testSchema(
    'contactFormSchema',
    contactFormSchema,
    {
      name: 'John Doe',
      email: 'john@example.com',
      subject: 'Test subject',
      message: 'This is a test message with enough characters'
    },
    {
      name: '', // nom vide
      email: 'invalid_email',
      subject: '',
      message: 'short' // message trop court
    }
  );
}

/**
 * Tests des schémas Prevention
 */
function testPreventionSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS PREVENTION ===');
  
  // Test données de demande de prévention
  testSchema(
    'preventionRequestDataSchema',
    preventionRequestDataSchema,
    {
      organizationName: 'Test Organization',
      contactPerson: 'John Doe',
      email: 'john@example.com',
      organizationType: 'School',
      targetAudience: 'Students',
      expectedParticipants: 50,
      preferredDates: '2024-03-15'
    },
    {
      organizationName: '', // nom vide
      email: 'invalid_email',
      expectedParticipants: -5 // nombre négatif
    }
  );
}

/**
 * Tests des schémas de paramètres
 */
function testParamsSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS DE PARAMÈTRES ===');
  
  // Test paramètres userId
  testSchema(
    'userIdParamsSchema',
    userIdParamsSchema,
    {
      userId: '123e4567-e89b-12d3-a456-426614174000'
    },
    {
      userId: 'invalid_uuid'
    }
  );
  
  // Test paramètres membership status
  testSchema(
    'membershipStatusParamsSchema',
    membershipStatusParamsSchema,
    {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      userType: 'individual'
    },
    {
      userId: 'invalid_uuid',
      userType: 'invalid_type'
    }
  );
}

/**
 * Tests des schémas de réponse
 */
function testResponseSchemas() {
  console.log('\n=== TESTS DES SCHÉMAS DE RÉPONSE ===');
  
  // Test réponse de succès
  testSchema(
    'successResponseSchema',
    successResponseSchema,
    {
      success: true,
      message: 'Operation successful',
      data: { id: 1 }
    },
    {
      success: false, // devrait être true
      message: 'This should fail'
    }
  );
  
  // Test réponse d'erreur
  testSchema(
    'errorResponseSchema',
    errorResponseSchema,
    {
      success: false,
      error: 'Something went wrong',
      message: 'Error details'
    },
    {
      success: true, // devrait être false
      error: 'This should fail'
    }
  );
  
  // Test réponse session Stripe
  testSchema(
    'stripeSessionResponseSchema',
    stripeSessionResponseSchema,
    {
      success: true,
      sessionId: 'cs_test_1234567890',
      url: 'https://checkout.stripe.com/pay/cs_test_1234567890'
    },
    {
      success: false, // devrait être true
      sessionId: 'invalid_session',
      url: 'invalid_url'
    }
  );
}

/**
 * Fonction principale pour exécuter tous les tests
 */
function runAllTests() {
  console.log('🚀 DÉBUT DES TESTS DES SCHÉMAS ZOD');
  console.log('=====================================');
  
  try {
    testBaseSchemas();
    testMembershipSchemas();
    testTrainingSchemas();
    testPaymentSchemas();
    testContactSchemas();
    testPreventionSchemas();
    testParamsSchemas();
    testResponseSchemas();
    
    console.log('\n✅ TOUS LES TESTS TERMINÉS');
    console.log('============================');
  } catch (error) {
    console.log('\n❌ ERREUR LORS DES TESTS:', error.message);
    console.log('============================');
  }
}

// Exécuter les tests si le fichier est appelé directement
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testSchema,
  testBaseSchemas,
  testMembershipSchemas,
  testTrainingSchemas,
  testPaymentSchemas,
  testContactSchemas,
  testPreventionSchemas,
  testParamsSchemas,
  testResponseSchemas,
};