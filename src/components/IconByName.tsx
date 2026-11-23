import React from "react";
import * as Fa from "react-icons/fa6";

interface IconByNameProps {
  name: string | null | undefined;
  size?: number | null;
  fallback?: React.ComponentType<{ size?: number }>;
}

export default function IconByName({
  name,
  size = 18,
  fallback: Fallback = Fa.FaRegSquare,
}: IconByNameProps) {
  const iconName = name as keyof typeof Fa;
  const Comp = (name && Fa[iconName] ? Fa[iconName] : Fallback) as React.ComponentType<{
    size?: number;
  }>;
  return size === null ? <Comp /> : <Comp size={size} />;
}
