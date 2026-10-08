FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY . .
RUN useradd --uid 10001 --create-home api && chown -R api:api /app
USER api
EXPOSE 8000
CMD ["sh", "start.sh"]
