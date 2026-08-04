FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm curl && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm install --omit=dev

COPY . .

RUN cd frontend && npm run build

EXPOSE 8000

CMD ["bash", "-lc", "cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
