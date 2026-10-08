import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import get_service_router
from app.core.database import engine
from app.core.exceptions import register_exception_handlers
from app.core.settings import settings
from app.middlewares import register_middlewares


@asynccontextmanager
async def lifespan(_):
    yield
    await engine.dispose()


def create_application():
    logging.basicConfig(level=logging.INFO)
    app = FastAPI(
        title="WikiWatch API",
        version="1.0.0",
        description="Instructor-provided backend for frontend training. One shared team. Real database, role permissions, review transitions and plain-text diff comments. Public Wikimedia reads stay in the browser. Login, copy access_token, then use Authorize. All JSON success responses use {success, data}.",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=settings.base_path + "/redoc",
        openapi_url=settings.base_path + "/openapi.json",
    )
    assets = settings.base_path + "/assets"
    app.mount(
        assets, StaticFiles(directory=Path(__file__).parent / "static"), name="swagger-assets"
    )

    @app.get(settings.base_path + "/swagger", include_in_schema=False)
    async def swagger():
        return get_swagger_ui_html(
            openapi_url=app.openapi_url,
            title="WikiWatch Swagger",
            swagger_js_url=assets + "/swagger-ui-bundle.js",
            swagger_css_url=assets + "/swagger-ui.css",
            swagger_favicon_url=assets + "/favicon-32x32.png",
        )

    register_middlewares(app)
    app.include_router(get_service_router())
    register_exception_handlers(app)
    return app


app = create_application()
