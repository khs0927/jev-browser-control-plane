FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 JEV_BIND_HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY gateway/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --uid 10001 --create-home jev
COPY --chown=jev:jev gateway/ ./
USER jev
EXPOSE 8080
CMD ["python", "server.py", "--http"]
