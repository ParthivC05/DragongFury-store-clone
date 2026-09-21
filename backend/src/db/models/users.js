'use strict';

const { isAdminPanelAccount } = require('../../constants/roles');

module.exports = function (sequelize, DataTypes) {
  const User = sequelize.define('User', {
    userId: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true
      // Uniqueness: (username, store_code) per-store via migration indexes
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
      // Uniqueness: (email, store_code) per-store via migration indexes; no model unique
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    emailVerificationToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    emailVerificationTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isPhoneVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_phone_verified'
    },
    phoneVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'phone_verified_at'
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    streetAddress: {
      type: DataTypes.STRING,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true
    },
    zipCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    profileImageUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passwordResetToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passwordResetTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    passwordResetAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'password_reset_at'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at'
    },
    signInType: {
      type: DataTypes.STRING,
      allowNull: true
    },
    googleId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'google_id'
      // Uniqueness: (google_id, store_code) per-store via migration indexes
    },
    facebookId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'facebook_id'
      // Uniqueness: (facebook_id, store_code) per-store via migration indexes
    },
    userReferralCode: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    userReferredBy: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    pendingFreeSpins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'pending_free_spins'
    },
    pendingDailyBonusSpins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'pending_daily_bonus_spins'
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_admin'
    },
    paymentApiPasswordEncrypted: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'payment_api_password_encrypted'
    },
    paymentApiEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'payment_api_email'
    },
    paymentAccountCreatedByPlatform: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'payment_account_created_by_platform'
    },
    role: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'user',
      field: 'role'
    },
    distributorCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'distributor_code'
    },
    storeCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'store_code'
    },
    userSiteUrl: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'user_site_url'
    },
    storeRoleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'store_role_id'
    },
    adminRoleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'admin_role_id'
    },

    onboardingCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'onboarding_completed'
    },

    /** Didit KYC: not_started | pending | approved | declined | in_review */
    kycStatus: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'not_started',
      field: 'kyc_status'
    },
    kycProvider: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'kyc_provider'
    },
    diditSessionId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'didit_session_id'
    },
    diditWorkflowId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'didit_workflow_id'
    },
    kycVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'kyc_verified_at'
    },
    kycUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'kyc_updated_at'
    },
    kycDeclineReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'kyc_decline_reason'
    },

    /** Golden Dragon: sent as `moneybox` when registering a client with the game provider. */
    drawer: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    signupBonusCodeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'signup_bonus_code_id'

    },
    deviceVisitorId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'device_visitor_id'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_at'
    }
  }, {
    sequelize,
    tableName: 'users',
    schema: 'public',
    // Explicit createdAt/updatedAt with field mapping fixes PG SQL (no "User"."createdAt"). createdAt/updatedAt: false avoids duplicate columns from Sequelize's auto timestamp attrs.
    timestamps: true,
    createdAt: false,
    updatedAt: false,
    underscored: true,
    paranoid: false,
    hooks: {
      beforeCreate(user) {
        const now = new Date();
        if (user.createdAt == null) user.setDataValue('createdAt', now);
        if (user.updatedAt == null) user.setDataValue('updatedAt', now);
        if (isAdminPanelAccount(user.role, user.isAdmin)) {
          user.setDataValue('isEmailVerified', true);
        }
      },
      beforeUpdate(user) {
        user.setDataValue('updatedAt', new Date());
      }
    }
  });

  User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.paymentApiPasswordEncrypted;
    return values;
  };

  User.prototype.toSafeJSON = function () {
    const raw = this.get();
    const values = this.toJSON();
    delete values.signupBonusCodeId;
    values.hasPaymentAccount = Boolean(raw.paymentApiPasswordEncrypted);
    values.paymentAccountCreatedByPlatform = Boolean(raw.paymentAccountCreatedByPlatform);
    values.paymentEmail = raw.paymentApiEmail || raw.email || null;
    return values;
  };

  User.associate = function (models) {
    if (models.StoreRole) {
      User.belongsTo(models.StoreRole, { foreignKey: 'storeRoleId' });
    }
    if (models.AdminRole) {
      User.belongsTo(models.AdminRole, { foreignKey: 'adminRoleId' });
    }
    if (models.Wallet) {
      User.hasMany(models.Wallet, { foreignKey: 'userId' });
    }
    if (models.UserGameAccount) {
      User.hasMany(models.UserGameAccount, { foreignKey: 'userId' });
    }
    if (models.GameActivity) {
      User.hasMany(models.GameActivity, { foreignKey: 'userId' });
    }
    if (models.VipUserState) {
      User.hasOne(models.VipUserState, { foreignKey: 'userId' });
    }
    if (models.BonusCode) {
      User.belongsTo(models.BonusCode, { foreignKey: 'signupBonusCodeId', as: 'SignupBonusCode' });
    }
  };

  return User;
};
