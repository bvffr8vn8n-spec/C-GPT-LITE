"use client";

import { useState, useEffect } from "react";

interface LocationPermissionCardProps {
  reason?: string;
  toolCallId: string;
  onConfirm: (result: {
    allowed: boolean;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    reason?: string;
  }) => void;
}

export default function LocationPermissionCard({
  reason,
  toolCallId,
  onConfirm,
}: LocationPermissionCardProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LocationPermissionCard.tsx:18',message:'LocationPermissionCard mounted',data:{toolCallId,reason},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    return () => {
      fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LocationPermissionCard.tsx:20',message:'LocationPermissionCard unmounted',data:{toolCallId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    };
  }, [toolCallId, reason]);
  // #endregion

  const handleAllow = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      // Проверяем поддержку геолокации
      if (!navigator.geolocation) {
        setError("Геолокация не поддерживается вашим браузером");
        onConfirm({
          allowed: false,
          reason: "geolocation not supported",
        });
        return;
      }

      // Запрашиваем местоположение
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Успешно получили местоположение
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          // Получаем город через reverse geocoding (Nominatim API)
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
              {
                headers: {
                  'User-Agent': 'ChatGPT-Lite-App/1.0', // Требуется Nominatim
                },
              }
            );

            if (response.ok) {
              const data = await response.json();
              const city = data.address?.city || 
                          data.address?.town || 
                          data.address?.village || 
                          data.address?.municipality ||
                          data.address?.county ||
                          data.address?.state ||
                          data.address?.country ||
                          "Неизвестно";
              const address = data.display_name || "";

              onConfirm({
                allowed: true,
                latitude,
                longitude,
                accuracy,
                city,
                address,
              });
            } else {
              // Если reverse geocoding не удался, возвращаем координаты без города
              onConfirm({
                allowed: true,
                latitude,
                longitude,
                accuracy,
              });
            }
          } catch (geocodeError) {
            // Если reverse geocoding не удался, возвращаем координаты без города
            console.warn("Не удалось определить город:", geocodeError);
            onConfirm({
              allowed: true,
              latitude,
              longitude,
              accuracy,
            });
          }
        },
        (error) => {
          // Ошибка получения местоположения
          let reason = "unknown error";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reason = "permission denied";
              break;
            case error.POSITION_UNAVAILABLE:
              reason = "position unavailable";
              break;
            case error.TIMEOUT:
              reason = "timeout";
              break;
          }
          setError(`Не удалось получить местоположение: ${reason}`);
          onConfirm({
            allowed: false,
            reason,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } catch (err: any) {
      setError(err.message || "Неизвестная ошибка");
      onConfirm({
        allowed: false,
        reason: err.message || "unknown error",
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDeny = () => {
    onConfirm({
      allowed: false,
      reason: "user denied",
    });
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: "16px",
        borderRadius: 12,
        border: "1px solid rgba(255,165,0,0.4)",
        background: "rgba(255,165,0,0.15)",
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5, fontWeight: 500 }}>
        {reason 
          ? `Разрешить доступ к вашему местоположению? ${reason}`
          : "Разрешить доступ к вашему местоположению?"}
      </div>
      {error && (
        <div style={{ 
          fontSize: 12, 
          color: "rgba(200,100,100,0.9)", 
          marginBottom: 12,
          padding: "8px",
          background: "rgba(200,100,100,0.1)",
          borderRadius: 6,
        }}>
          ⚠️ {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleAllow}
          disabled={isRequesting}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(100,200,100,0.5)",
            background: isRequesting 
              ? "rgba(100,200,100,0.1)" 
              : "rgba(100,200,100,0.2)",
            color: "inherit",
            cursor: isRequesting ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 500,
            opacity: isRequesting ? 0.6 : 1,
          }}
        >
          {isRequesting ? "Получение..." : "Разрешить"}
        </button>
        <button
          onClick={handleDeny}
          disabled={isRequesting}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(200,100,100,0.5)",
            background: isRequesting 
              ? "rgba(200,100,100,0.1)" 
              : "rgba(200,100,100,0.2)",
            color: "inherit",
            cursor: isRequesting ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 500,
            opacity: isRequesting ? 0.6 : 1,
          }}
        >
          Отклонить
        </button>
      </div>
    </div>
  );
}

