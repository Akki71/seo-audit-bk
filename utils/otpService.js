const crypto = require('crypto');
const User = require('../models/User');

const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

const sendOTP = async (email, type = 'verification') => {
    try {
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const user = await User.findOne({ where: { email } });
        if (!user) {
            throw new Error('User not found');
        }

        await user.update({ otp, otpExpires });

        const { sendOTPEmail, sendPasswordResetEmail } = require('./emailService');

        if (type === 'reset') {
            return await sendPasswordResetEmail(email, otp);
        } else {
            return await sendOTPEmail(email, otp);
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        return { success: false, error: error.message };
    }
};

const verifyOTP = async (email, otp) => {
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return { success: false, message: 'User not found' };
        }

        if (!user.otp || !user.otpExpires) {
            return { success: false, message: 'No OTP found' };
        }

        if (new Date() > user.otpExpires) {
            return { success: false, message: 'OTP expired' };
        }

        if (user.otp !== otp) {
            return { success: false, message: 'Invalid OTP' };
        }

        // Clear OTP after successful verification
        await user.update({ otp: null, otpExpires: null });

        return { success: true, user };
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendOTP,
    verifyOTP,
};
