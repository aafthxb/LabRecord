
[
  "c",
  "java"
].forEach(language => {
  const script = document.createElement("script");

  script.src =
    `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${language}.min.js`;

  script.defer = true;

  document.head.appendChild(script);
});
