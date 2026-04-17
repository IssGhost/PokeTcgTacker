const jwt = require("jsonwebtoken");

function signAuthCookie(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "14d" }
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.redirect("/login");
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (_err) {
    res.clearCookie("auth_token");
    return res.redirect("/login");
  }
}

module.exports = { signAuthCookie, requireAuth };
