"""API package bootstrap.

Border has a legacy dynamic /{border_id} route. Register the new specific lazy
routes before it so /catalog and /live/{code} cannot be swallowed by the
legacy matcher.
"""
from .borders import borders_router as _borders_router
from .borders_lazy import lazy_border_router as _lazy_border_router

_existing_paths = {getattr(route, "path", None) for route in _borders_router.routes}
_lazy_routes = [
    route for route in _lazy_border_router.routes
    if getattr(route, "path", None) not in _existing_paths
]
_borders_router.routes[0:0] = _lazy_routes
