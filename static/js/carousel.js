document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
  var slides = carousel.querySelectorAll('.project-carousel__slide');
  var dots = carousel.querySelectorAll('.project-carousel__dot');
  var prevButton = carousel.querySelector('.project-carousel__prev');
  var nextButton = carousel.querySelector('.project-carousel__next');
  var index = 0;

  function show(newIndex) {
    index = (newIndex + slides.length) % slides.length;
    slides.forEach(function (slide, i) {
      slide.classList.toggle('is-active', i === index);
    });
    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === index);
    });
  }

  if (prevButton) {
    prevButton.addEventListener('click', function () {
      show(index - 1);
    });
  }

  if (nextButton) {
    nextButton.addEventListener('click', function () {
      show(index + 1);
    });
  }

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () {
      show(i);
    });
  });
});
