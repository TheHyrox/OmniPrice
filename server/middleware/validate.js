const { ZodError } = require('zod');

/**
 * Express middleware factory.
 * Validates req.body against the given Zod schema.
 * On success it replaces req.body with the parsed (coerced) value.
 * On failure it returns 400 with a structured error list.
 *
 * @param {import('zod').ZodTypeAny} schema
 */
function validate(schema) {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                const errors = err.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                }));
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors,
                });
            }
            next(err);
        }
    };
}

module.exports = { validate };
