"use client";

import React, { useEffect, useRef, useState } from "react";

interface UseGeneralSettingsOptions<T> {
  onLoaded?: (mapped: T) => void;
}

export function useGeneralSettings<T extends Record<string, any>>(
  initialState: T,
  mapFromApi: (data: Record<string, any>) => T,
  options?: UseGeneralSettingsOptions<T>,
) {
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<T>(initialState);

  const mapRef = useRef(mapFromApi);
  mapRef.current = mapFromApi;
  const onLoadedRef = useRef(options?.onLoaded);
  onLoadedRef.current = options?.onLoaded;

  useEffect(() => {
    fetch("/api/general")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error && Object.keys(data).length > 0) {
          const mapped = mapRef.current(data);
          setFormData(mapped);
          onLoadedRef.current?.(mapped);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const value = target.type === "checkbox" ? target.checked : target.value;
    const name = target.name;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent, beforeSave?: () => boolean) => {
    e.preventDefault();
    if (beforeSave && !beforeSave()) return;

    try {
      const res = await fetch("/api/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) alert("Nastavení uloženo");
      else alert("Chyba při ukládání");
    } catch (error) {
      console.error(error);
      alert("Chyba při ukládání");
    }
  };

  return { loading, formData, setFormData, handleChange, handleSubmit };
}
