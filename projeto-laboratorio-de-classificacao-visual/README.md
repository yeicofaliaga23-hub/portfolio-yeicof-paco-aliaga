# 🧠 Laboratório de Classificação Visual
> Projeto desenvolvido no **Teachable Machine (Google)** com o objetivo de explorar o treinamento de modelos de visão computacional e compreender os impactos éticos do viés algorítmico.

---

## 🎯 Contexto do Projeto
O experimento foi realizado como parte de um estudo sobre **inteligência artificial aplicada à classificação de imagens**.  
A proposta consistiu em criar um modelo simples de reconhecimento facial e observar como **a limitação dos dados de treinamento** pode gerar resultados distorcidos e enviesados.

---

## ⚙️ Desenvolvimento do Modelo

### 🔹 Criação das Categorias
Foram definidas duas classes principais:
- **Feliz**
- **Bravo**

Cada classe recebeu **24 amostras de imagem**, capturadas via webcam e upload manual.  
Essas imagens representavam expressões faciais distintas, servindo como base para o aprendizado do modelo.

---

### 🔹 Treinamento
O treinamento foi realizado diretamente na interface do Teachable Machine.  
Após o carregamento das imagens, o modelo foi processado e marcado como **Model Trained**, indicando que o aprendizado foi concluído.

<img width="100%" alt="Treinamento do Modelo" src="https://github.com/user-attachments/assets/7cf28e16-8d32-41de-8127-56b646df81a8" />

---

### 🔹 Teste de Inferência
Durante o teste, uma imagem fora do padrão foi utilizada — uma pessoa com expressão neutra.  
O modelo classificou incorretamente como **“Bravo” (100%)**, demonstrando o efeito do viés de treinamento e a limitação do dataset.

<img width="100%" alt="Erro de Classificação" src="https://github.com/user-attachments/assets/8d661463-80ad-4962-a67a-965d48fca343" />

---

## 💡 Análise dos Resultados
O modelo apresentou **alta precisão dentro do conjunto de dados original**, mas **falhou ao generalizar** para casos fora do padrão.  
Essa falha evidencia como **a escolha de dados influencia diretamente o comportamento da IA**, reforçando estereótipos e limitando sua capacidade de interpretação.

---

## 🧩 Reflexão Ética
A experiência mostrou que um modelo treinado com dados restritos **aprende padrões sociais enviesados**, reproduzindo preconceitos e invisibilizando perfis diversos.  
Esse tipo de erro pode gerar impactos emocionais e profissionais, afetando a forma como pessoas são percebidas por sistemas automatizados.

A solução proposta é a inclusão de um processo **Human-in-the-loop**, onde humanos revisam e validam os dados antes do treinamento, garantindo diversidade e equidade na curadoria.

---

## 🏁 Conclusão
O **Laboratório de Classificação Visual** demonstrou, na prática, como **datasets limitados comprometem a lógica algorítmica** e reforçam estereótipos sociais.  
A atividade permitiu compreender que o desenvolvimento de IA exige não apenas técnica, mas também **responsabilidade ética e consciência social**.  
O resultado final reforça a importância de unir **engenharia e empatia** para criar sistemas verdadeiramente justos, inclusivos e representativos.
